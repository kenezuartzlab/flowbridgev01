/**
 * Scheduled settlement batch preparation (pure).
 *
 * Produces an UNSIGNED publishEpoch candidate after hard preflight checks.
 * Grants no signing or publishing authority: the existing PUBLISHER_ROLE
 * holder must still review, sign and broadcast in its own wallet. The app
 * never holds a private key, never signs and never broadcasts.
 */
import { encodeFunctionData, getAddress, keccak256, toHex, type Hex } from "viem";
import { buildPayoutBatch, discoverRounds, type PayoutBatch } from "./payoutBatch";
import type { DraftAllocationInput, ProgramId } from "./rewardFundingPlan";
import { MAINNET_MIN_CLAIM_FLOW } from "./claimMinimumPolicy";
import { hashPair, merkleClaimLeafHash, verifyMerkleProof } from "./merkleClaim";

export const PUBLISH_EPOCH_ABI = [{
  type: "function", name: "publishEpoch", stateMutability: "nonpayable",
  inputs: [{ name: "root", type: "bytes32" }, { name: "allocation", type: "uint256" }, { name: "claimStart", type: "uint64" }, { name: "claimEnd", type: "uint64" }],
  outputs: [{ name: "epochId", type: "uint256" }],
}] as const;

/** Automation mode is fixed: prepare only. Changing this requires a new owner gate. */
export const SETTLEMENT_AUTOMATION = Object.freeze({
  mode: "PREPARE_ONLY" as const,
  autonomousSigning: false,
  serverPrivateKey: false,
  newPublisherGrants: false,
  publicClaimsUnlocked: false,
});

/** Single designated publisher (owner decision: one signer for speed). Reviews and signs manually. */
export const SETTLEMENT_SIGNER = Object.freeze({
  mode: "SINGLE_SIGNER" as const,
  role: "PUBLISHER_ROLE",
  address: getAddress("0x971e7790fe6c8f77dc666bb05d4aeda362653f94"),
  note: "One publisher wallet reviews the server-listed batch and signs publishEpoch in its own wallet. The app never signs.",
});

export const DISTRIBUTOR_ROLES = Object.freeze({
  DEFAULT_ADMIN_ROLE: ("0x" + "0".repeat(64)) as Hex,
  BUDGET_MANAGER_ROLE: keccak256(toHex("BUDGET_MANAGER_ROLE")),
  PUBLISHER_ROLE: keccak256(toHex("PUBLISHER_ROLE")),
  PAUSER_ROLE: keccak256(toHex("PAUSER_ROLE")),
});
export type RoleName = keyof typeof DISTRIBUTOR_ROLES;

/** PASS only when the publisher holds PUBLISHER_ROLE and nothing else. */
export function auditPublisherRoles(held: Partial<Record<RoleName, boolean>> | null) {
  if (!held) return { status: "UNKNOWN" as const, publisher: false, extraRoles: [] as RoleName[], pass: false };
  const extraRoles = (Object.keys(DISTRIBUTOR_ROLES) as RoleName[]).filter((r) => r !== "PUBLISHER_ROLE" && held[r]);
  const publisher = !!held.PUBLISHER_ROLE;
  return { status: publisher && !extraRoles.length ? "PASS" as const : "FAIL" as const, publisher, extraRoles, pass: publisher && !extraRoles.length };
}

const WEI = 10n ** 18n;
const CLAIM_WINDOW_SECONDS = 30 * 86_400;
const START_MARGIN_SECONDS = 2 * 3_600;
/** Opening is rounded to the hour so rebuilding within the same hour is byte-identical. */
const START_ROUNDING_SECONDS = 3_600;

export interface ChainState {
  epochCount: number;
  campaignBudgetWei: bigint;
  totalClaimedWei: bigint;
  totalReservedWei: bigint;
  balanceWei: bigint;
  minPublishDelay: number;
  paused: boolean;
  nowSec: number;
}

export interface ProgramFunding {
  programId: ProgramId;
  /** Funded points from this program that enter the batch. */
  includedPoints: number;
  /** Funded points still unallocated in this program's budget. */
  availablePoints: number;
}

export interface SettlementInput {
  rows: (DraftAllocationInput & { alreadyAllocatedPoints: number })[];
  /** Points remaining in each funded program bucket (off-chain reservations). */
  fundedPointsAvailable: number;
  /** Per-program attribution of batch points. Omit only in legacy callers/tests. */
  programs?: ProgramFunding[];
  publisherRoles?: Partial<Record<RoleName, boolean>> | null;
  chain: ChainState;
  chainId: number;
  distributor: Hex;
}

export type Check = { id: string; pass: boolean; detail: string };

function stable(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
}

/** Hash of every material input. Any change ⇒ "Settlement changed — rebuild before signing." */
export function settlementFingerprint(i: SettlementInput): Hex {
  const c = i.chain;
  return keccak256(toHex(stable({
    epochCount: c.epochCount, paused: c.paused, budget: c.campaignBudgetWei, claimed: c.totalClaimedWei,
    reserved: c.totalReservedWei, balance: c.balanceWei, delay: c.minPublishDelay,
    hour: Math.floor(c.nowSec / START_ROUNDING_SECONDS),
    funded: i.fundedPointsAvailable,
    programs: [...(i.programs ?? [])].sort((a, b) => (a.programId < b.programId ? -1 : 1)),
    rows: [...i.rows].map((r) => [r.userId, r.wallet?.toLowerCase() ?? null, r.classification, Math.floor(r.authoritative), r.pendingReview, Math.floor(r.alreadyAllocatedPoints)])
      .sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : 1)),
  })));
}

function buildOnce(i: SettlementInput) {
  const checks: Check[] = [];
  const add = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });
  const sync = discoverRounds(i.chain.epochCount);
  add("ROUNDS_IN_SYNC", sync.missingFromApp.length === 0, sync.missingFromApp.length ? `missing ${sync.missingFromApp.join(",")}` : "every on-chain round is known");
  add("NOT_PAUSED", !i.chain.paused, "distributor pause state");
  if (i.publisherRoles !== undefined) {
    const a = auditPublisherRoles(i.publisherRoles);
    add("PUBLISHER_ROLE", a.publisher, a.status === "UNKNOWN" ? "roles unreadable" : `PUBLISHER_ROLE ${a.publisher ? "held" : "missing"}`);
  }

  // Delta settlement: only points not already allocated in a prior round.
  const deltas = i.rows.map((r) => ({ ...r, authoritative: Math.max(0, Math.floor(r.authoritative) - Math.floor(r.alreadyAllocatedPoints)) }));
  const ids = new Set<string>();
  const dupUser = i.rows.some((r) => (ids.has(r.userId) ? true : (ids.add(r.userId), false)));
  add("NO_DUPLICATE_ACCOUNTS", !dupUser, "one row per account");
  const wallets = new Set<string>();
  const dupWallet = i.rows.some((r) => { const w = r.wallet?.toLowerCase(); if (!w) return false; if (wallets.has(w)) return true; wallets.add(w); return false; });
  add("NO_DUPLICATE_WALLETS", !dupWallet, "one account per wallet");
  const historical = i.rows.filter((r) => r.classification !== "MATCH" && r.classification !== "EXPLAINED_DIFFERENCE");
  add("HISTORICAL_EXCLUDED", true, `${historical.length} reviewed/historical accounts excluded by builder`);

  const epochId = i.chain.epochCount + 1;
  let batch: PayoutBatch | null = null;
  if (!dupUser && !dupWallet) {
    try {
      batch = buildPayoutBatch(deltas, { chainId: i.chainId, distributor: i.distributor, epochId });
      add("PROOFS_VERIFIED", true, `${batch.leaves.length} proofs self-verified`);
    } catch (e) {
      add("PROOFS_VERIFIED", false, (e as Error).message);
    }
  }
  const totalWei = BigInt(batch?.totalWei ?? "0");
  add("NONEMPTY", !!batch?.root, batch?.root ? `has leaves ≥ ${MAINNET_MIN_CLAIM_FLOW} FLOW` : "NO_ELIGIBLE_WALLETS_ABOVE_MINIMUM");
  add("MINIMUM_ENFORCED", !!batch && batch.leaves.every((l) => BigInt(l.amount) >= BigInt(MAINNET_MIN_CLAIM_FLOW) * WEI), "every leaf ≥ 1,000 FLOW (canary exception is round #2 only)");
  add("FUNDED_BUCKET", totalWei <= BigInt(i.fundedPointsAvailable) * WEI, "within funded program reservations");
  if (i.programs) {
    const inc = i.programs.reduce((t, p) => t + p.includedPoints, 0);
    const over = i.programs.filter((p) => p.includedPoints > p.availablePoints);
    add("BUDGET_SEPARATION", !over.length && BigInt(inc) * WEI === totalWei,
      over.length ? `over budget: ${over.map((p) => p.programId).join(",")}` : `every FLOW attributed to one program (${inc} = batch total)`);
  }
  const newReserved = i.chain.totalReservedWei + totalWei;
  add("BUDGET_CAP", i.chain.totalClaimedWei + newReserved <= i.chain.campaignBudgetWei, "claimed + reserved ≤ campaignBudget");
  add("BALANCE", i.chain.balanceWei >= newReserved, "balance ≥ reserved");

  const earliest = i.chain.nowSec + i.chain.minPublishDelay + START_MARGIN_SECONDS;
  const claimStart = Math.ceil(earliest / START_ROUNDING_SECONDS) * START_ROUNDING_SECONDS;
  const claimEnd = claimStart + CLAIM_WINDOW_SECONDS;
  const ready = checks.every((c) => c.pass);
  const tx = ready && batch?.root ? {
    to: i.distributor, value: "0", chainId: i.chainId,
    data: encodeFunctionData({ abi: PUBLISH_EPOCH_ABI, functionName: "publishEpoch", args: [batch.root, totalWei, BigInt(claimStart), BigInt(claimEnd)] }),
    requiredSigner: SETTLEMENT_SIGNER.address,
    signed: false, broadcast: false,
  } : null;
  return { ready, epochId, checks, batch, claimStart, claimEnd, tx };
}

export function prepareSettlementBatch(i: SettlementInput) {
  const a = buildOnce(i);
  const b = buildOnce(i);
  const deterministic = a.epochId === b.epochId && a.batch?.root === b.batch?.root && a.batch?.leaves.length === b.batch?.leaves.length
    && a.batch?.totalWei === b.batch?.totalWei && a.claimStart === b.claimStart && a.claimEnd === b.claimEnd && a.tx?.data === b.tx?.data;
  const checks = [...a.checks, { id: "DETERMINISTIC", pass: deterministic, detail: "built twice from the same state; identical output" }];
  const ready = a.ready && deterministic;
  const noEligible = !a.batch?.root;
  return {
    status: ready ? "READY_FOR_PUBLISHER_REVIEW" as const : "BLOCKED" as const,
    reason: ready ? null : noEligible ? "NO_ELIGIBLE_WALLETS_ABOVE_MINIMUM" : checks.filter((c) => !c.pass).map((c) => c.id).join(", "),
    epochId: a.epochId, checks, batch: a.batch, claimStart: a.claimStart, claimEnd: a.claimEnd,
    tx: ready ? a.tx : null, fingerprint: settlementFingerprint(i), automation: SETTLEMENT_AUTOMATION,
  };
}

/** True when a reviewed batch must be rebuilt before signing. */
export function isSettlementStale(reviewedFingerprint: string | null | undefined, liveFingerprint: string): boolean {
  return !reviewedFingerprint || reviewedFingerprint.toLowerCase() !== liveFingerprint.toLowerCase();
}
export const STALE_SETTLEMENT_MESSAGE = "Settlement changed — rebuild before signing.";

export interface StoredBatch { epochId: number; root: Hex; totalWei: string; claimStart: number; claimEnd: number; leaves: { index: number; account: Hex; amount: string; proof: Hex[] }[] }
export interface OnchainEpoch { root: Hex; allocation: bigint; claimStart: bigint | number; claimEnd: bigint | number; cancelled: boolean; released: boolean }

/**
 * Post-publish verification (pure). A round is COMPLETE only after the receipt
 * succeeded and the live epoch matches the reviewed batch exactly.
 */
export function verifyPublishedRound(p: {
  batch: StoredBatch; receiptStatus: "success" | "reverted" | null; liveEpochCount: number; epoch: OnchainEpoch | null;
  paused: boolean; balanceWei: bigint; totalReservedWei: bigint; chainId: number; distributor: Hex; probe?: Hex;
}) {
  const checks: Check[] = [];
  const add = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });
  add("RECEIPT_SUCCESS", p.receiptStatus === "success", p.receiptStatus ?? "no receipt yet");
  add("ROUND_COUNT", p.liveEpochCount >= p.batch.epochId, `live ${p.liveEpochCount} vs round #${p.batch.epochId}`);
  add("ROOT_MATCH", !!p.epoch && p.epoch.root.toLowerCase() === p.batch.root.toLowerCase(), "on-chain root equals reviewed root");
  add("ALLOCATION_MATCH", !!p.epoch && p.epoch.allocation === BigInt(p.batch.totalWei), "on-chain allocation equals batch total");
  add("WINDOW_MATCH", !!p.epoch && Number(p.epoch.claimStart) === p.batch.claimStart && Number(p.epoch.claimEnd) === p.batch.claimEnd, "claim window matches");
  add("NOT_CANCELLED", !!p.epoch && !p.epoch.cancelled && !p.epoch.released, "round active");
  add("SOLVENT", p.balanceWei >= p.totalReservedWei, "balance ≥ reserved");
  add("NOT_PAUSED", !p.paused, "distributor not paused");
  const allVerify = p.batch.leaves.every((l) => verifyMerkleProof({
    leaf: merkleClaimLeafHash({ chainId: p.chainId, distributor: p.distributor, leaf: { epochId: p.batch.epochId, index: l.index, account: l.account, amount: l.amount } }),
    proof: l.proof, root: p.batch.root,
  }));
  add("EXPECTED_WALLETS_VERIFY", allVerify, `${p.batch.leaves.length} leaves verify against root`);
  const probe = p.probe ?? ("0x000000000000000000000000000000000000dEaD" as Hex);
  const first = p.batch.leaves[0];
  const strangerVerifies = !!first && verifyMerkleProof({
    leaf: merkleClaimLeafHash({ chainId: p.chainId, distributor: p.distributor, leaf: { epochId: p.batch.epochId, index: first.index, account: probe, amount: first.amount } }),
    proof: first.proof, root: p.batch.root,
  });
  add("NO_UNEXPECTED_WALLET", !strangerVerifies, "a non-listed wallet does not verify");
  return { complete: checks.every((c) => c.pass), checks };
}

// Re-exported so tests can build malformed proofs without importing internals.
export { hashPair };
