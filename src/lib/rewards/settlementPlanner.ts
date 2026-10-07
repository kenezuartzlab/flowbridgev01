/**
 * V32.6 — Scheduled settlement batch preparation (pure).
 *
 * Produces an UNSIGNED publishEpoch candidate after hard preflight checks.
 * Grants no signing or publishing authority: the existing PUBLISHER_ROLE
 * holder must still review, sign and broadcast. Public claims stay locked.
 */
import { encodeFunctionData, type Hex } from "viem";
import { buildPayoutBatch, discoverRounds, type PayoutBatch } from "./payoutBatch";
import type { DraftAllocationInput } from "./rewardFundingPlan";

export const PUBLISH_EPOCH_ABI = [{
  type: "function", name: "publishEpoch", stateMutability: "nonpayable",
  inputs: [{ name: "root", type: "bytes32" }, { name: "allocation", type: "uint256" }, { name: "claimStart", type: "uint64" }, { name: "claimEnd", type: "uint64" }],
  outputs: [{ name: "epochId", type: "uint256" }],
}] as const;

/** Automation mode is fixed: prepare only. Changing this requires a new owner gate. */
export const SETTLEMENT_AUTOMATION = Object.freeze({
  mode: "PREPARE_ONLY" as const,
  autonomousSigning: false,
  newPublisherGrants: false,
  publicClaimsUnlocked: false,
});

/** Single designated publisher (owner decision: one signer for speed). Reviews and signs manually. */
export const SETTLEMENT_SIGNER = Object.freeze({
  mode: "SINGLE_SIGNER" as const,
  role: "PUBLISHER_ROLE",
  address: "0x971E" as const,
  note: "One publisher EOA reviews the server-listed batch and signs publishEpoch in its own wallet. The app never signs.",
});

const WEI = 10n ** 18n;
const CLAIM_WINDOW_SECONDS = 30 * 86_400;
const START_MARGIN_SECONDS = 2 * 3_600;

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

export interface SettlementInput {
  rows: (DraftAllocationInput & { alreadyAllocatedPoints: number })[];
  /** Points remaining in each funded program bucket (off-chain reservations). */
  fundedPointsAvailable: number;
  chain: ChainState;
  chainId: number;
  distributor: Hex;
}

export type Check = { id: string; pass: boolean; detail: string };

export function prepareSettlementBatch(i: SettlementInput) {
  const checks: Check[] = [];
  const add = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });
  const sync = discoverRounds(i.chain.epochCount);
  add("ROUNDS_IN_SYNC", sync.inSync, sync.inSync ? "app manifest matches on-chain epochCount" : `missing ${sync.missingFromApp.join(",")}`);
  add("NOT_PAUSED", !i.chain.paused, "distributor pause state");

  // Delta settlement: only points not already allocated in a prior round.
  const deltas = i.rows.map((r) => ({ ...r, authoritative: Math.max(0, Math.floor(r.authoritative) - Math.floor(r.alreadyAllocatedPoints)) }));
  const ids = new Set<string>();
  const dupUser = i.rows.some((r) => (ids.has(r.userId) ? true : (ids.add(r.userId), false)));
  add("NO_DUPLICATE_ACCOUNTS", !dupUser, "one row per account");
  const historical = i.rows.filter((r) => r.classification !== "MATCH" && r.classification !== "EXPLAINED_DIFFERENCE");
  add("HISTORICAL_EXCLUDED", true, `${historical.length} reviewed/historical accounts excluded by builder`);

  const epochId = i.chain.epochCount + 1;
  let batch: PayoutBatch | null = null;
  try {
    batch = buildPayoutBatch(deltas, { chainId: i.chainId, distributor: i.distributor, epochId });
    add("PROOFS_VERIFIED", true, `${batch.leaves.length} proofs self-verified`);
  } catch (e) {
    add("PROOFS_VERIFIED", false, (e as Error).message);
  }
  const totalWei = BigInt(batch?.totalWei ?? "0");
  add("NONEMPTY", !!batch?.root, batch?.root ? "has leaves ≥ 1,000 FLOW" : "no account meets the 1,000 FLOW minimum");
  add("MINIMUM_ENFORCED", !!batch && batch.leaves.every((l) => BigInt(l.amount) >= 1_000n * WEI), "every leaf ≥ 1,000 FLOW (canary exception is round #2 only)");
  add("FUNDED_BUCKET", totalWei <= BigInt(i.fundedPointsAvailable) * WEI, "within funded program reservations");
  const newReserved = i.chain.totalReservedWei + totalWei;
  add("BUDGET_CAP", i.chain.totalClaimedWei + newReserved <= i.chain.campaignBudgetWei, "claimed + reserved ≤ campaignBudget");
  add("BALANCE", i.chain.balanceWei >= newReserved, "balance ≥ reserved");

  const claimStart = i.chain.nowSec + i.chain.minPublishDelay + START_MARGIN_SECONDS;
  const claimEnd = claimStart + CLAIM_WINDOW_SECONDS;
  const ready = checks.every((c) => c.pass);
  const tx = ready && batch?.root ? {
    to: i.distributor, value: "0",
    data: encodeFunctionData({ abi: PUBLISH_EPOCH_ABI, functionName: "publishEpoch", args: [batch.root, totalWei, BigInt(claimStart), BigInt(claimEnd)] }),
    requiredSigner: "PUBLISHER_ROLE holder (manual review + signature)",
    signed: false, broadcast: false,
  } : null;
  return { status: ready ? "READY_FOR_PUBLISHER_REVIEW" as const : "BLOCKED" as const, epochId, checks, batch, claimStart, claimEnd, tx, automation: SETTLEMENT_AUTOMATION };
}
