/**
 * Server-side settlement preparation + post-publish verification + round
 * discovery. READ-ONLY on chain (eth_call only). The only write is the
 * off-chain record of a prepared batch so its proofs can be served after the
 * publisher signs. No private key exists here; nothing is signed or broadcast.
 */
import { createPublicClient, http, parseAbi, type Address, type Hex } from "viem";
import { MAINNET_PAYOUT_AUDIT, type ProgramId } from "./rewardFundingPlan";
import { MAINNET_EPOCH_MANIFESTS } from "./mainnetEpochManifest";
import { MAINNET_CHAIN_ID } from "./historicalReconciliation";
import {
  auditPublisherRoles, DISTRIBUTOR_ROLES, prepareSettlementBatch, SETTLEMENT_SIGNER, verifyPublishedRound,
  type ChainState, type ProgramFunding, type RoleName, type StoredBatch,
} from "./settlementPlanner";

export const DISTRIBUTOR = MAINNET_PAYOUT_AUDIT.address as Address;
const RPC = "https://rpc.botchain.ai";
const ABI = parseAbi([
  "function totalReserved() view returns (uint256)", "function paused() view returns (bool)", "function campaignBudget() view returns (uint256)",
  "function epochCount() view returns (uint256)", "function totalClaimed() view returns (uint256)", "function minPublishDelay() view returns (uint64)",
  "function token() view returns (address)", "function balanceOf(address) view returns (uint256)", "function hasRole(bytes32,address) view returns (bool)",
  "function isClaimed(uint256,uint256) view returns (bool)",
  "function getEpoch(uint256) view returns ((bytes32 root,uint256 allocation,uint256 claimed,uint64 claimStart,uint64 claimEnd,bool cancelled,bool released))",
]);
const client = () => createPublicClient({ transport: http(RPC) });
const WEI = 10n ** 18n;

export async function readChainState(): Promise<ChainState | null> {
  try {
    const c = client();
    const rd = <T,>(functionName: string, args: unknown[] = [], address: Address = DISTRIBUTOR) =>
      c.readContract({ address, abi: ABI, functionName: functionName as never, args: args as never }) as Promise<T>;
    const token = await rd<Address>("token");
    const [epochCount, totalClaimed, delay, reserved, budget, paused, balance, block] = await Promise.all([
      rd<bigint>("epochCount"), rd<bigint>("totalClaimed"), rd<bigint>("minPublishDelay"), rd<bigint>("totalReserved"),
      rd<bigint>("campaignBudget"), rd<boolean>("paused"), rd<bigint>("balanceOf", [DISTRIBUTOR], token), c.getBlock(),
    ]);
    return { epochCount: Number(epochCount), totalClaimedWei: totalClaimed, minPublishDelay: Number(delay), totalReservedWei: reserved,
      campaignBudgetWei: budget, paused, balanceWei: balance, nowSec: Number(block.timestamp) };
  } catch { return null; }
}

export async function readPublisherRoles(): Promise<Record<RoleName, boolean> | null> {
  try {
    const c = client();
    const names = Object.keys(DISTRIBUTOR_ROLES) as RoleName[];
    const vals = await Promise.all(names.map((n) => c.readContract({ address: DISTRIBUTOR, abi: ABI, functionName: "hasRole", args: [DISTRIBUTOR_ROLES[n], SETTLEMENT_SIGNER.address] })));
    return Object.fromEntries(names.map((n, i) => [n, vals[i]])) as Record<RoleName, boolean>;
  } catch { return null; }
}

export async function readEpoch(epochId: number) {
  try { return await client().readContract({ address: DISTRIBUTOR, abi: ABI, functionName: "getEpoch", args: [BigInt(epochId)] }); } catch { return null; }
}

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];
type BatchRow = { epoch_id: number; root: string; total_wei: string | number; claim_start: number; claim_end: number; leaves: StoredBatch["leaves"]; publication_verified_at: string | null };
const toBatch = (r: BatchRow): StoredBatch => ({ epochId: r.epoch_id, root: r.root as Hex, totalWei: BigInt(String(r.total_wei).split(".")[0]).toString(), claimStart: Number(r.claim_start), claimEnd: Number(r.claim_end), leaves: r.leaves });

/** Stored batches whose root is LIVE on chain (published + verified). */
export async function discoverPublishedBatches(admin: Admin, liveEpochCount: number) {
  const staticIds = new Set(MAINNET_EPOCH_MANIFESTS.map((m) => m.epochId));
  const { data } = await admin.from("reward_settlement_batches").select("epoch_id,root,total_wei,claim_start,claim_end,leaves,publication_verified_at")
    .eq("chain_id", MAINNET_CHAIN_ID).eq("distributor", DISTRIBUTOR.toLowerCase()).lte("epoch_id", liveEpochCount);
  const out: { batch: StoredBatch; verification: ReturnType<typeof verifyPublishedRound> }[] = [];
  const chain = await readChainState();
  for (const row of (data ?? []) as unknown as BatchRow[]) {
    if (staticIds.has(row.epoch_id)) continue;
    const ep = await readEpoch(row.epoch_id);
    if (!ep || ep.root.toLowerCase() !== row.root.toLowerCase()) continue; // rebuilt candidates that were never signed
    const batch = toBatch(row);
    const verification = verifyPublishedRound({
      batch, receiptStatus: "success", liveEpochCount, epoch: ep, paused: chain?.paused ?? true,
      balanceWei: chain?.balanceWei ?? 0n, totalReservedWei: chain?.totalReservedWei ?? 1n, chainId: MAINNET_CHAIN_ID, distributor: DISTRIBUTOR,
    });
    if (verification.complete && !row.publication_verified_at) {
      await admin.from("reward_settlement_batches").update({ publication_verified_at: new Date().toISOString() })
        .eq("epoch_id", row.epoch_id).eq("root", row.root);
    }
    out.push({ batch, verification });
  }
  return out;
}

export interface LedgerRow { user_id: string; points: number; chain_id: number | null; funding_state: string | null; program_id: string | null }
export interface ReconRow { userId: string; classification: string; authoritative: number; pendingReview: number }

const PROGRAMS: ProgramId[] = ["CORE_SWAP", "REFERRAL_MILESTONE", "SIGNUP_BONUS"];

export async function buildSettlement(args: {
  admin: Admin; recon: ReconRow[]; ledger: LedgerRow[]; wallets: Map<string, string | null>;
  budgets: { program_id: string; total_points: number }[];
}) {
  const [live, roles] = await Promise.all([readChainState(), readPublisherRoles()]);
  const publisher = { address: SETTLEMENT_SIGNER.address, ...auditPublisherRoles(roles) };
  const generatedAt = new Date().toISOString();
  if (!live) return { status: "BLOCKED" as const, reason: "LIVE_CONTRACT_STATE_UNAVAILABLE", signer: SETTLEMENT_SIGNER, publisher, epochId: null, leaves: 0, totalFlow: 0, root: null, checks: [], tx: null, fingerprint: null, programs: [], claimStartIso: null, claimEndIso: null, published: [], liveState: null, generatedAt };

  const discovered = await discoverPublishedBatches(args.admin, live.epochCount);

  // Already-allocated FLOW per wallet across every published round (static + discovered).
  const allocated = new Map<string, number>();
  const addAlloc = (acct: string, wei: string) => { const k = acct.toLowerCase(); allocated.set(k, (allocated.get(k) ?? 0) + Number(BigInt(wei) / WEI)); };
  for (const m of MAINNET_EPOCH_MANIFESTS) for (const e of m.entitlements) addAlloc(e.account, e.amount);
  for (const d of discovered) for (const l of d.batch.leaves) addAlloc(l.account, l.amount);

  // Only FUNDED Mainnet ledger points; per-program attribution (no cross-bucket cover).
  const fundedBy = new Map<string, Map<ProgramId, number>>();
  for (const l of args.ledger) {
    if (l.funding_state !== "FUNDED" || l.chain_id !== MAINNET_CHAIN_ID) continue;
    const prog = (PROGRAMS.includes(l.program_id as ProgramId) ? l.program_id : "OTHER") as ProgramId;
    const m = fundedBy.get(l.user_id) ?? new Map<ProgramId, number>();
    m.set(prog, (m.get(prog) ?? 0) + l.points);
    fundedBy.set(l.user_id, m);
  }
  const rows = args.recon.filter((x) => fundedBy.has(x.userId)).map((x) => {
    const w = args.wallets.get(x.userId) ?? null;
    const fundedTotal = [...(fundedBy.get(x.userId)?.values() ?? [])].reduce((a, b) => a + b, 0);
    return { userId: x.userId, wallet: w, classification: x.classification, authoritative: Math.min(fundedTotal, x.authoritative), pendingReview: x.pendingReview, alreadyAllocatedPoints: w ? allocated.get(w.toLowerCase()) ?? 0 : 0 };
  });

  const first = prepareSettlementBatch({ rows, fundedPointsAvailable: Number.MAX_SAFE_INTEGER, chain: live, chainId: MAINNET_CHAIN_ID, distributor: DISTRIBUTOR, knownEpochIds: discovered.map((d) => d.batch.epochId) });
  // Attribute each included wallet's delta to programs in fixed order (prior allocations consume first).
  const included = new Set((first.batch?.leaves ?? []).map((l) => l.account.toLowerCase()));
  const inc = new Map<ProgramId, number>();
  const usedBefore = new Map<ProgramId, number>();
  for (const r of rows) {
    let prior = Math.floor(r.alreadyAllocatedPoints);
    let delta = Math.max(0, Math.floor(r.authoritative) - prior);
    const by = fundedBy.get(r.userId)!;
    for (const p of [...PROGRAMS, "OTHER" as ProgramId]) {
      let v = Math.floor(by.get(p) ?? 0);
      const pr = Math.min(prior, v); prior -= pr; v -= pr; usedBefore.set(p, (usedBefore.get(p) ?? 0) + pr);
      if (r.wallet && included.has(r.wallet.toLowerCase())) { const d = Math.min(delta, v); delta -= d; inc.set(p, (inc.get(p) ?? 0) + d); }
    }
  }
  const budgetOf = (p: ProgramId) => Number(args.budgets.find((b) => b.program_id === p)?.total_points ?? 0);
  const programs: ProgramFunding[] = [...PROGRAMS, "OTHER" as ProgramId].map((p) => ({ programId: p, includedPoints: inc.get(p) ?? 0, availablePoints: Math.max(0, budgetOf(p) - (usedBefore.get(p) ?? 0)) }));
  const fundedAvail = programs.reduce((t, p) => t + p.availablePoints, 0);

  const p = prepareSettlementBatch({ rows, fundedPointsAvailable: fundedAvail, programs, publisherRoles: roles, chain: live, chainId: MAINNET_CHAIN_ID, distributor: DISTRIBUTOR, knownEpochIds: discovered.map((d) => d.batch.epochId) });

  if (p.status === "READY_FOR_PUBLISHER_REVIEW" && p.batch?.root) {
    await args.admin.from("reward_settlement_batches").upsert({
      chain_id: MAINNET_CHAIN_ID, distributor: DISTRIBUTOR.toLowerCase(), epoch_id: p.epochId, root: p.batch.root,
      total_wei: p.batch.totalWei as never, claim_start: p.claimStart, claim_end: p.claimEnd, fingerprint: p.fingerprint,
      leaves: p.batch.leaves.map((l) => ({ index: l.index, account: l.account, amount: l.amount, proof: l.proof })),
      program_breakdown: programs as never,
    }, { onConflict: "chain_id,distributor,epoch_id,root", ignoreDuplicates: true });
  }

  return {
    status: p.status, reason: p.reason, signer: SETTLEMENT_SIGNER, publisher,
    epochId: p.epochId, leaves: p.batch?.leaves.length ?? 0,
    totalFlow: p.batch ? Number(BigInt(p.batch.totalWei) / WEI) : 0, root: p.batch?.root ?? null,
    checks: p.checks, tx: p.tx, fingerprint: p.fingerprint, programs: programs.filter((x) => x.includedPoints > 0 || x.availablePoints > 0),
    claimStartIso: new Date(p.claimStart * 1000).toISOString(), claimEndIso: new Date(p.claimEnd * 1000).toISOString(),
    published: discovered.map((d) => ({ epochId: d.batch.epochId, root: d.batch.root, complete: d.verification.complete, checks: d.verification.checks })),
    liveState: { epochCount: live.epochCount, paused: live.paused, budgetFlow: Number(live.campaignBudgetWei / WEI), balanceFlow: Number(live.balanceWei / WEI), reservedFlow: Number(live.totalReservedWei / WEI), claimedFlow: Number(live.totalClaimedWei / WEI), blockTimeIso: new Date(live.nowSec * 1000).toISOString() },
    generatedAt,
  };
}

/** Round #2 canary status read live (no claim tx lookup beyond isClaimed). */
export async function readCanaryStatus() {
  try {
    const c = client();
    const [ep, claimed] = await Promise.all([readEpoch(2), c.readContract({ address: DISTRIBUTOR, abi: ABI, functionName: "isClaimed", args: [2n, 0n] })]);
    return { epochId: 2, claimed, claimedFlow: ep ? Number(ep.claimed / WEI) : null, claimStartIso: ep ? new Date(Number(ep.claimStart) * 1000).toISOString() : null };
  } catch { return null; }
}
