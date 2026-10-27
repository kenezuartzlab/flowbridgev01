/**
 * Server-side settlement preparation + post-publish verification + round
 * discovery. READ-ONLY on chain (eth_call only). The only write is the
 * off-chain record of a prepared batch so its proofs can be served after the
 * publisher signs. No private key exists here; nothing is signed or broadcast.
 */
import { CLAIM_WINDOW_POLICY, PUBLIC_MAINNET_FLOW_CLAIMS, settlementEligibility } from "./publicClaimPolicy";
import { integerWei, revalidateImmutableBatch } from './immutableBatch';
import { proposeScheduleRenewal, type RenewalProposal } from './scheduleRenewal';
import { resolveBatchSchedule } from './scheduleRenewal.server';
import { createPublicClient, http, parseAbi, type Address, type Hex } from "viem";
import { MAINNET_PAYOUT_AUDIT, type ProgramId } from "./rewardFundingPlan";
import { MAINNET_EPOCH_MANIFESTS } from "./mainnetEpochManifest";
import { publisherLimitChecks } from "./publishGate";
import { PUBLISHER_CONFIG } from "./settlementQueue";
import { attributeSignupAward, SIGNUP_REASONS, type SignupAttribution } from "./signupAttribution";
import { MAINNET_CHAIN_ID } from "./historicalReconciliation";
import { BUILDER_SOURCE, detectRoundDrift, HISTORICAL_SOURCE, planRoundIndexSync, type ProofSource, type RoundSource } from "./historicalRoundIndex";
import {
  auditPublisherRoles, DISTRIBUTOR_ROLES, prepareSettlementBatch, SETTLEMENT_SIGNER, verifyPublishedRound,
  type ChainState, type OnchainEpoch, type ProgramFunding, type RoleName, type StoredBatch,
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
const toBatch = (r: BatchRow): StoredBatch => ({ epochId: r.epoch_id, root: r.root as Hex, totalWei: integerWei(r.total_wei), claimStart: Number(r.claim_start), claimEnd: Number(r.claim_end), leaves: r.leaves });

/**
 * Read-only historical indexing: every on-chain round missing a local record is
 * indexed from chain truth + a proof source that reproduces its root. Metadata
 * only — idempotent (unique chain+distributor+round for imports), never
 * overwrites drift, never touches the chain.
 */
export async function indexHistoricalRounds(admin: Admin, liveEpochCount: number) {
  const { data } = await admin.from("reward_settlement_batches").select("epoch_id,root,total_wei,claim_start,claim_end,leaves,publication_verified_at")
    .eq("chain_id", MAINNET_CHAIN_ID).eq("distributor", DISTRIBUTOR.toLowerCase());
  const local = ((data ?? []) as unknown as BatchRow[]).filter(b => b.epoch_id <= liveEpochCount).map(toBatch);
  const chainEpochs = new Map<number, OnchainEpoch | null>();
  for (let id = 1; id <= liveEpochCount; id++) chainEpochs.set(id, (await readEpoch(id)) as OnchainEpoch | null);
  const proofSources: ProofSource[] = MAINNET_EPOCH_MANIFESTS.map((m) => ({ epochId: m.epochId, root: m.root, leaves: m.entitlements.map((e) => ({ index: e.index, account: e.account, amount: e.amount, proof: e.proof })) }));
  const actions = planRoundIndexSync({ chainId: MAINNET_CHAIN_ID, distributor: DISTRIBUTOR, epochCount: liveEpochCount, local, chainEpochs, proofSources });
  for (const a of actions) {
    if (a.action !== "IMPORT") continue;
    const r = a.record;
    await admin.from("reward_settlement_batches").upsert({
      chain_id: MAINNET_CHAIN_ID, distributor: DISTRIBUTOR.toLowerCase(), epoch_id: r.epochId, root: r.root, total_wei: r.totalWei as never,
      claim_start: r.claimStart, claim_end: r.claimEnd, fingerprint: `historical:${r.root}`, leaves: r.leaves as never,
      program_breakdown: [] as never, source: HISTORICAL_SOURCE,
    }, { onConflict: "chain_id,distributor,epoch_id,root", ignoreDuplicates: true });
  }
  return actions.map((a) => a.action === "IMPORT" ? { epochId: a.epochId, action: a.action } : a);
}

/** Indexed records (builder + historical) whose root is LIVE on chain and drift-free. */
export async function discoverPublishedBatches(admin: Admin, liveEpochCount: number) {
  const indexing = await indexHistoricalRounds(admin, liveEpochCount).catch(() => []);
  const { data } = await admin.from("reward_settlement_batches").select("id,fingerprint,epoch_id,root,total_wei,claim_start,claim_end,leaves,publication_verified_at,source")
    .eq("chain_id", MAINNET_CHAIN_ID).eq("distributor", DISTRIBUTOR.toLowerCase()).lte("epoch_id", liveEpochCount).order("epoch_id", { ascending: true });
  const out: { batch: StoredBatch; source: RoundSource; verification: ReturnType<typeof verifyPublishedRound> }[] = [];
  const chain = await readChainState();
  const seen = new Set<number>();
  for (const original of (data ?? []) as unknown as (BatchRow & { id: string; fingerprint: string; source: RoundSource })[]) {
    const row = await resolveBatchSchedule(admin, original);
    if (seen.has(row.epoch_id)) continue;
    if (row.source !== HISTORICAL_SOURCE && row.epoch_id > 2) {
      const { data: attempt, error } = await admin.from("reward_publish_attempts").select("tx_hash,phase").eq("chain_id",MAINNET_CHAIN_ID).eq("distributor",DISTRIBUTOR.toLowerCase()).eq("epoch_id",row.epoch_id).eq("root",row.root).maybeSingle();
      if (error || !attempt?.tx_hash || attempt.phase !== "CONFIRMED_VERIFIED") continue;
      const { verifyPublicationOnChain } = await import("./publicationRecovery.server");
      const receipt = await verifyPublicationOnChain(toBatch(row),attempt.tx_hash as Hex,SETTLEMENT_SIGNER.address).catch(()=>null);
      if (receipt?.phase !== "CONFIRMED_VERIFIED") continue;
    }

    const ep = await readEpoch(row.epoch_id);
    if (!ep || ep.root.toLowerCase() !== row.root.toLowerCase()) continue; // rebuilt candidates that were never signed
    const batch = toBatch(row);
    if (detectRoundDrift(batch, ep as OnchainEpoch).length) continue; // ROUND_METADATA_DRIFT: chain wins, never served
    const verification = verifyPublishedRound({
      batch, receiptStatus: "success", liveEpochCount, epoch: ep, paused: chain?.paused ?? true,
      balanceWei: chain?.balanceWei ?? 0n, totalReservedWei: chain?.totalReservedWei ?? 1n, chainId: MAINNET_CHAIN_ID, distributor: DISTRIBUTOR,
    });
    if (verification.complete && !row.publication_verified_at && row.epoch_id <= 2) {
      await admin.from("reward_settlement_batches").update({ publication_verified_at: new Date().toISOString() })
        .eq("epoch_id", row.epoch_id).eq("root", row.root);
    }
    seen.add(row.epoch_id);
    out.push({ batch, source: row.source ?? BUILDER_SOURCE, verification });
  }
  return Object.assign(out, { indexing });
}

/**
 * V36.1 — shared, non-account-specific cache of PUBLIC chain round data
 * (live distributor state + verified published rounds). Per-wallet claim
 * status is never cached here. 60s TTL; concurrent callers share one fetch.
 */
type PublishedSnapshot = { live: ChainState | null; found: Awaited<ReturnType<typeof discoverPublishedBatches>> };
let roundsCache: { at: number; p: Promise<PublishedSnapshot> } | null = null;
const ROUNDS_TTL_MS = 60_000;
export function getPublishedRoundsCached(admin: Admin): Promise<PublishedSnapshot> {
  if (roundsCache && Date.now() - roundsCache.at < ROUNDS_TTL_MS) return roundsCache.p;
  const p = (async () => {
    const live = await readChainState();
    if (!live) return { live: null, found: Object.assign([], { indexing: [] }) as any };
    return { live, found: await discoverPublishedBatches(admin, live.epochCount) };
  })();
  roundsCache = { at: Date.now(), p };
  p.then((s) => { if (!s.live) roundsCache = null; }, () => { roundsCache = null; });
  return p;
}

/** V36.1 — verified on-chain claimed-wallet count for one round (isClaimed per leaf). */
const claimedCountCache = new Map<number, { at: number; v: { claimed: number; total: number; unreadable: number } }>();
export async function countRoundClaims(epochId: number, leafIndexes: number[]) {
  const hit = claimedCountCache.get(epochId);
  if (hit && Date.now() - hit.at < ROUNDS_TTL_MS) return hit.v;
  const res = await Promise.all(leafIndexes.map((i) => readIsClaimed(epochId, i)));
  const v = { claimed: res.filter((r) => r === true).length, total: res.length, unreadable: res.filter((r) => r == null).length };
  if (!v.unreadable) claimedCountCache.set(epochId, { at: Date.now(), v });
  return v;
}

export interface LedgerRow { id?: string; user_id: string; points: number; chain_id: number | null; funding_state: string | null; program_id: string | null; reason?: string; policy_version?: string | null; reservation_id?: string | null; wallet_address?: string | null; metadata?: unknown }
export interface ReconRow { userId: string; classification: string; authoritative: number; pendingReview: number; eligibleRowIds?: string[] }

const PROGRAMS: ProgramId[] = ["CORE_SWAP", "REFERRAL_MILESTONE", "SIGNUP_BONUS"];

export async function buildSettlement(args: {
  admin: Admin; recon: ReconRow[]; ledger: LedgerRow[]; wallets: Map<string, string | null>;
  budgets: { program_id: string; total_points: number; funding_verified?: boolean }[];
  profiles?: Map<string, { createdAt: string | null; wallet: string | null }>;
}) {
  const evidenceFence = await args.admin.rpc('reward_payout_evidence_hash');
  if (evidenceFence.error || !evidenceFence.data) throw new Error('PAYOUT_EVIDENCE_UNAVAILABLE');
  const [live, roles] = await Promise.all([readChainState(), readPublisherRoles()]);
  const publisher = { address: SETTLEMENT_SIGNER.address, ...auditPublisherRoles(roles) };
  const generatedAt = new Date().toISOString();
  if (!live) return { status: "BLOCKED" as const, reason: "LIVE_CONTRACT_STATE_UNAVAILABLE", signer: SETTLEMENT_SIGNER, publisher, epochId: null, leaves: 0, totalFlow: 0, root: null, checks: [], tx: null, fingerprint: null, programs: [], claimStartIso: null, claimEndIso: null, published: [], liveState: null, renewal: null as RenewalProposal | null, generatedAt };

  const discovered = await discoverPublishedBatches(args.admin, live.epochCount);

  // Already-allocated FLOW per wallet across every published round (static + discovered).
  const allocated = new Map<string, number>();
  const addAlloc = (acct: string, wei: string) => { const k = acct.toLowerCase(); allocated.set(k, (allocated.get(k) ?? 0) + Number(BigInt(wei) / WEI)); };
  const discoveredIds = new Set(discovered.map((d) => d.batch.epochId));
  for (const m of MAINNET_EPOCH_MANIFESTS) if (!discoveredIds.has(m.epochId)) for (const e of m.entitlements) addAlloc(e.account, e.amount);
  for (const d of discovered) for (const l of d.batch.leaves) addAlloc(l.account, l.amount);
  // Unsigned candidates are not allocations: count only live on-chain rounds.
  // Rebuilding a prepared candidate must not consume itself or strand its points.

  // V36.3A — signup awards carry no chain id; attribute only after full provenance + funding verification.
  const signup = await reconcileSignupAwards(args);
  const effChain = (l: LedgerRow, i: number) => (signup.mainnetIdx.has(i) ? MAINNET_CHAIN_ID : l.chain_id);

  // Only FUNDED Mainnet ledger points; per-program attribution (no cross-bucket cover).
  const fundedBy = new Map<string, Map<ProgramId, number>>();
  const routineBy = new Map<string, Map<ProgramId, number>>();
  const { validRewardReservation } = await import('./approvedRewardPolicy');
  const { data: reservations, error: reservationError } = await args.admin.from('reward_reservations').select('reservation_id,ledger_id,user_id,wallet_address,points,program_id');
  if (reservationError) throw new Error('REWARD_RESERVATIONS_UNAVAILABLE');
  const reservationById = new Map((reservations ?? []).map((r) => [r.reservation_id, r]));
  const eligibleIds = new Set(args.recon.flatMap(r => r.eligibleRowIds ?? []));
  for (const [i, l] of args.ledger.entries()) {
    if (!l.id || !eligibleIds.has(l.id)) continue;
    if (l.funding_state !== "FUNDED" || effChain(l, i) !== MAINNET_CHAIN_ID) continue;
    if ((SIGNUP_REASONS as readonly string[]).includes(l.reason ?? '') && !signup.mainnetIdx.has(i)) continue;
    const reservation = l.reservation_id ? reservationById.get(l.reservation_id) : null;
    if (!l.id || !validRewardReservation({ ledgerId: l.id, userId: l.user_id, wallet: l.wallet_address ?? null, points: l.points, program: l.program_id,
      reservation: reservation ? { ledgerId: reservation.ledger_id, userId: reservation.user_id, wallet: reservation.wallet_address, points: reservation.points, program: reservation.program_id } : null })) continue;
    if (!l.wallet_address || l.wallet_address.toLowerCase() !== args.wallets.get(l.user_id)?.toLowerCase()) continue;
    const prog = (PROGRAMS.includes(l.program_id as ProgramId) ? l.program_id : "OTHER") as ProgramId;
    const m = fundedBy.get(l.user_id) ?? new Map<ProgramId, number>();
    m.set(prog, (m.get(prog) ?? 0) + l.points);
    fundedBy.set(l.user_id, m);
    if ((l.metadata as Record<string, unknown> | null)?.provenanceExceptionApproved !== true && (l as LedgerRow & { provenance_state?: string }).provenance_state !== 'EXCEPTION_APPROVED') {
      const routine = routineBy.get(l.user_id) ?? new Map<ProgramId, number>();
      routine.set(prog, (routine.get(prog) ?? 0) + l.points);
      routineBy.set(l.user_id, routine);
    }
  }
  const rows = args.recon.filter((x) => fundedBy.has(x.userId)).map((x) => {
    const w = args.wallets.get(x.userId) ?? null;
    const fundedTotal = [...(fundedBy.get(x.userId)?.values() ?? [])].reduce((a, b) => a + b, 0);
    return { userId: x.userId, wallet: w, classification: x.classification, authoritative: fundedTotal, pendingReview: x.pendingReview, alreadyAllocatedPoints: w ? allocated.get(w.toLowerCase()) ?? 0 : 0, fundedByProgram: Object.fromEntries(fundedBy.get(x.userId) ?? []) as Record<string, number>, routineFundedByProgram: Object.fromEntries(routineBy.get(x.userId) ?? []) as Record<string, number> };
  });
  // V37.1 — new rounds contain ONLY confirmed, not-yet-published approvals, each capped
  // at its approved amount. Unapproved balances never enter a prepared batch.
  const { data: confirmedOpen, error: approvalsError } = await args.admin.from('reward_payout_approvals').select('user_id,wallet,points,confirmed_at,program_breakdown').eq('status', 'CONFIRMED').is('settlement_batch_id', null);
  if (approvalsError) throw new Error('PAYOUT_APPROVALS_UNAVAILABLE');
  const approvedBy = new Map((confirmedOpen ?? []).map((a) => [a.user_id, a]));
  const batchRows = rows.flatMap((r) => {
    const a = approvedBy.get(r.userId);
    if (!a || !r.wallet || a.wallet.toLowerCase() !== r.wallet.toLowerCase()) return [];
    return [{ ...r, authoritative: Math.min(r.authoritative, Math.floor(r.alreadyAllocatedPoints) + Number(a.points)) }];
  });

  const first = prepareSettlementBatch({ rows: batchRows, fundedPointsAvailable: Number.MAX_SAFE_INTEGER, chain: live, chainId: MAINNET_CHAIN_ID, distributor: DISTRIBUTOR, knownEpochIds: discovered.map((d) => d.batch.epochId) });
  // Attribute each included wallet's delta to programs in fixed order (prior allocations consume first).
  const included = new Set((first.batch?.leaves ?? []).map((l) => l.account.toLowerCase()));
  const inc = new Map<ProgramId, number>();
  const usedBefore = new Map<ProgramId, number>();
  for (const r of batchRows) {
    let prior = Math.floor(r.alreadyAllocatedPoints);
    let delta = Math.max(0, Math.floor(r.authoritative) - prior);
    const by = fundedBy.get(r.userId);
    if (!by) continue;
    for (const p of [...PROGRAMS, "OTHER" as ProgramId]) {
      let v = Math.floor(by.get(p) ?? 0);
      const pr = Math.min(prior, v); prior -= pr; v -= pr; usedBefore.set(p, (usedBefore.get(p) ?? 0) + pr);
      if (r.wallet && included.has(r.wallet.toLowerCase())) { const d = Math.min(delta, v); delta -= d; inc.set(p, (inc.get(p) ?? 0) + d); }
    }
  }
  const budgetOf = (p: ProgramId) => Number(args.budgets.find((b) => b.program_id === p)?.total_points ?? 0);
  const programs: ProgramFunding[] = [...PROGRAMS, "OTHER" as ProgramId].map((p) => ({ programId: p, includedPoints: inc.get(p) ?? 0, availablePoints: Math.max(0, budgetOf(p) - (usedBefore.get(p) ?? 0)) }));
  const fundedAvail = programs.reduce((t, p) => t + p.availablePoints, 0);

  let p = prepareSettlementBatch({ rows: batchRows, fundedPointsAvailable: fundedAvail, programs, publisherRoles: roles, chain: live, chainId: MAINNET_CHAIN_ID, distributor: DISTRIBUTOR, knownEpochIds: discovered.map((d) => d.batch.epochId) });
  const { data: existing, error: existingError } = await args.admin.from('reward_settlement_batches').select('*')
    .eq('chain_id', MAINNET_CHAIN_ID).eq('distributor', DISTRIBUTOR.toLowerCase()).eq('epoch_id', p.epochId);
  if (existingError) throw new Error('STORED_BATCH_LOOKUP_UNAVAILABLE');
  const { data: retired, error: retiredError } = await args.admin.from('reward_retired_drafts').select('batch_id');
  if (retiredError) throw new Error('DRAFT_RETIREMENT_STATE_UNAVAILABLE');
  const retiredIds = new Set((retired ?? []).map(r => r.batch_id));
  // Only the exact owner-held draft can be retired; chain and DB uncertainty fail closed.
  for (const draft of existing ?? []) {
    if (retiredIds.has(draft.id) || draft.epoch_id !== 4 || draft.root !== '0xe2af18b23c702ddf6d0bd32e717ca4f8a997deb0dbf4f3df508096d8be2065a5' || live.epochCount !== 3) continue;
    const { data: didRetire, error: retirementError } = await args.admin.rpc('retire_unapproved_reward_draft', { p_batch: draft.id, p_now: live.nowSec, p_delay: live.minPublishDelay, p_epoch: live.epochCount });
    if (!retirementError && didRetire) retiredIds.add(draft.id);
  }
  const active = (existing ?? []).filter(b => !retiredIds.has(b.id));
  if (active.length > 1) throw new Error('AMBIGUOUS_STORED_BATCH');
  const original = active[0];
  const provenanceExcludedPoints = args.ledger.filter(l => l.points > 0 && l.chain_id === MAINNET_CHAIN_ID && (l.reason === 'CORE_SWAP' || l.reason === 'CORE_SWAP_V2') && !eligibleIds.has(l.id ?? '')).reduce((total,l)=>total+l.points,0);
  let stored = original ? await resolveBatchSchedule(args.admin, original) : undefined;
  let renewal: RenewalProposal | null = null;
  if (stored) {
    const immutable = { ...toBatch(stored as unknown as BatchRow), id: stored.id, fingerprint: stored.fingerprint, published: !!stored.publication_verified_at };
    renewal = proposeScheduleRenewal(p, immutable, live.nowSec, live.minPublishDelay, original?.fingerprint);
    if (renewal.ready && renewal.epochId >= 4) {
      const { data: refreshed, error } = await args.admin.rpc('refresh_funded_batch_schedule', { p_batch: stored.id, p_start: renewal.claimStart, p_end: renewal.claimEnd, p_fingerprint: renewal.fingerprint, p_now: live.nowSec, p_delay: live.minPublishDelay, p_evidence: evidenceFence.data });
      if (!error && refreshed && original) {
        stored = await resolveBatchSchedule(args.admin, original);
        Object.assign(immutable, toBatch(stored as unknown as BatchRow), { fingerprint: stored.fingerprint });
        renewal = null;
      }
    }
    p = revalidateImmutableBatch(p, immutable, live.nowSec, live.minPublishDelay);
  }

  // V36.3A — batch/day limits + exact eth_call simulation from the publisher.
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const { data: recent, error: recentError } = await args.admin.from("reward_settlement_batches").select("total_wei,publication_verified_at")
    .eq("chain_id", MAINNET_CHAIN_ID).gte("publication_verified_at", dayAgo);
  if (recentError) throw new Error('PUBLICATION_LIMIT_STATE_UNAVAILABLE');
  const flowPublishedLast24h = ((recent ?? []) as { total_wei: string | number }[]).reduce((t, r) => t + Number(BigInt(integerWei(r.total_wei)) / WEI), 0);
  const batchFlow = p.batch ? Number(BigInt(p.batch.totalWei) / WEI) : 0;
  const limits = publisherLimitChecks({ wallets: p.batch?.leaves.length ?? 0, totalFlow: batchFlow, flowPublishedLast24h });
  let simulation: { ran: boolean; ok: boolean; detail: string } = { ran: false, ok: false, detail: "no publishable transaction" };
  if (p.tx) {
    try {
      await client().call({ account: SETTLEMENT_SIGNER.address, to: DISTRIBUTOR, data: p.tx.data as Hex });
      simulation = { ran: true, ok: true, detail: "publishEpoch eth_call from the publisher succeeds against live state" };
    } catch (e) {
      simulation = { ran: true, ok: false, detail: String((e as Error).message ?? e).split("\n")[0].slice(0, 200) };
    }
  }
  const provenanceCheck = { id: 'REWARD_PROVENANCE', pass: !stored || p.checks.every(c => c.id !== 'IMMUTABLE_ALLOCATION' || c.pass), detail: provenanceExcludedPoints > 0 ? `${provenanceExcludedPoints} Core Swap Points excluded pending independent historical evidence review. Stored batch is unchanged.` : 'Independent earning evidence accepted.' };
  const checks = [...p.checks, ...limits, provenanceCheck, ...(p.tx ? [{ id: "SIMULATION", pass: simulation.ok, detail: simulation.detail }] : [])];
  const publishable = p.status === "READY_FOR_PUBLISHER_REVIEW" && limits.every((c) => c.pass) && simulation.ok;
  const includedSet = new Set((p.batch?.leaves ?? []).map((l) => l.account.toLowerCase()));
  const opaque = (id: string) => `Account ${rows.findIndex((r) => r.userId === id) + 1}`;
  const walletStates = rows.map((r) => {
    const delta = Math.max(0, Math.floor(r.authoritative) - Math.floor(r.alreadyAllocatedPoints));
    const state = r.wallet && includedSet.has(r.wallet.toLowerCase()) ? "INCLUDED"
      : r.pendingReview > 0 ? "REVIEW_HELD"
      : r.classification !== "MATCH" && r.classification !== "EXPLAINED_DIFFERENCE" ? "REJECTED_HISTORICAL"
      : !r.wallet ? "PENDING_NO_WALLET"
      : delta < 1 ? "PENDING_BELOW_MINIMUM" : "PENDING_LIMITS";
    return { account: opaque(r.userId), state, fundedPoints: Math.floor(r.authoritative), alreadySettled: Math.floor(r.alreadyAllocatedPoints), delta };
  });

  if (publishable && p.batch?.root && !stored) {
    const { error: saveError } = await args.admin.rpc('persist_funded_reward_batch', {
      p_epoch: p.epochId, p_root: p.batch.root, p_total: Number(p.batch.totalWei), p_start: p.claimStart, p_end: p.claimEnd, p_fingerprint: p.fingerprint,
      p_leaves: p.batch.leaves.map((l) => ({ index: l.index, account: l.account, amount: l.amount, proof: l.proof })),
      p_programs: programs as never, p_evidence: evidenceFence.data,
    });
    if (saveError) throw new Error('PREPARED_BATCH_PERSISTENCE_FAILED');
  }

  return {
    status: publishable ? p.status : "BLOCKED" as const,
    reason: publishable ? null : p.reason ?? checks.filter((c) => !c.pass).map((c) => c.id).join(", "),
    simulation, limits, renewal, flowPublishedLast24h, walletStates, signupReconciliation: signup.report, provenanceExcludedPoints,
    // Server-only per-account settlement facts (userId + wallet). Never serialized
    // to anonymized report consumers; the V37 approval queue reads these.
    accountRows: rows,
    publisherConfig: { mode: PUBLISHER_CONFIG.mode, autonomousSigning: PUBLISHER_CONFIG.autonomousSigning, maxWalletsPerEpoch: PUBLISHER_CONFIG.maxWalletsPerEpoch, maxFlowPerEpoch: PUBLISHER_CONFIG.maxFlowPerEpoch, maxFlowPerDay: PUBLISHER_CONFIG.maxFlowPerDay },
    signer: SETTLEMENT_SIGNER, publisher,
    batchId: stored?.id ?? null,
    storedAllocation: stored ? { wallets: toBatch(stored as unknown as BatchRow).leaves.length, totalFlow: Number(BigInt(integerWei(stored.total_wei)) / WEI) } : null,
    epochId: p.epochId, leaves: p.batch?.leaves.length ?? 0,
    totalFlow: p.batch ? Number(BigInt(p.batch.totalWei) / WEI) : 0, root: p.batch?.root ?? null,
    checks, tx: publishable ? p.tx : null, fingerprint: p.fingerprint, programs: programs.filter((x) => x.includedPoints > 0 || x.availablePoints > 0),
    claimStartIso: new Date(p.claimStart * 1000).toISOString(), claimEndIso: new Date(p.claimEnd * 1000).toISOString(),
    published: discovered.map((d) => ({ epochId: d.batch.epochId, root: d.batch.root, source: d.source, complete: d.verification.complete, checks: d.verification.checks })),
    indexing: discovered.indexing,
    liveState: { epochCount: live.epochCount, paused: live.paused, budgetFlow: Number(live.campaignBudgetWei / WEI), balanceFlow: Number(live.balanceWei / WEI), reservedFlow: Number(live.totalReservedWei / WEI), claimedFlow: Number(live.totalClaimedWei / WEI), blockTimeIso: new Date(live.nowSec * 1000).toISOString() },
    readiness: {
      ...settlementEligibility(rows.map((r) => ({ wallet: r.wallet, classification: r.classification, pendingReview: r.pendingReview, fundedPoints: r.authoritative, authoritative: r.authoritative, alreadySettledPoints: r.alreadyAllocatedPoints }))),
      nextBatchWallets: p.batch?.leaves.length ?? 0,
      nextBatchFlow: p.batch ? Number(BigInt(p.batch.totalWei) / WEI) : 0,
      publishedUnclaimedFlow: Number(live.totalReservedWei / WEI),
      claimedFlow: Number(live.totalClaimedWei / WEI),
      publicClaimsFlag: PUBLIC_MAINNET_FLOW_CLAIMS ? "ON" as const : "OFF" as const,
      claimWindowPolicy: CLAIM_WINDOW_POLICY.status,
      publisherReady: publisher.pass,
    },
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

/** V34 — read-only claim flag for one leaf (null when the chain is unreadable). */
export async function readIsClaimed(epochId: number, index: number): Promise<boolean | null> {
  try { return await client().readContract({ address: DISTRIBUTOR, abi: ABI, functionName: "isClaimed", args: [BigInt(epochId), BigInt(index)] }) as boolean; } catch { return null; }
}

/** V36.3A — read-only signup award provenance reconciliation (no ledger writes). */
async function reconcileSignupAwards(args: {
  admin: Admin; ledger: LedgerRow[]; wallets: Map<string, string | null>;
  budgets: { program_id: string; funding_verified?: boolean }[]; profiles?: Map<string, { createdAt: string | null; wallet: string | null }>;
}) {
  const mainnetIdx = new Set<number>();
  const idx = args.ledger.map((l, i) => [l, i] as const).filter(([l]) => l.program_id === "SIGNUP_BONUS" && (SIGNUP_REASONS as readonly string[]).includes(l.reason ?? ""));
  const fundingVerified = !!args.budgets.find((b) => b.program_id === "SIGNUP_BONUS")?.funding_verified;
  const refereeOf = (l: LedgerRow) => l.reason === "SIGNUP_BONUS_REFEREE" ? l.user_id : String((l.metadata as Record<string, unknown> | null)?.refereeId ?? "");
  const walletCount = new Map<string, number>();
  for (const l of args.ledger) if (l.reason === "SIGNUP_BONUS_REFEREE" && l.wallet_address) walletCount.set(l.wallet_address.toLowerCase(), (walletCount.get(l.wallet_address.toLowerCase()) ?? 0) + 1);
  const refereeWallet = new Map<string, string | null>();
  for (const l of args.ledger) if (l.reason === "SIGNUP_BONUS_REFEREE") refereeWallet.set(l.user_id, l.wallet_address?.toLowerCase() ?? null);
  const emailOk = new Map<string, boolean>();
  for (const id of new Set(idx.map(([l]) => refereeOf(l)).filter(Boolean))) {
    try { const { data } = await args.admin.auth.admin.getUserById(id); emailOk.set(id, !!data.user?.email_confirmed_at); } catch { emailOk.set(id, false); }
  }
  const byState = new Map<SignupAttribution, { rows: number; points: number }>();
  for (const [l, i] of idx) {
    const ref = refereeOf(l);
    const rw = refereeWallet.get(ref) ?? null;
    const a = attributeSignupAward({
      points: l.points,
      reason: l.reason ?? "", programId: l.program_id, chainId: l.chain_id, fundingState: l.funding_state, policyVersion: l.policy_version ?? null,
      reservationId: l.reservation_id ?? null, ledgerWallet: l.wallet_address ?? null,
      refereeCreatedAt: args.profiles?.get(ref)?.createdAt ?? null, refereeEmailVerified: emailOk.get(ref) ?? false,
      recipientBoundWallet: args.wallets.get(l.user_id) ?? null, refereeWalletAwardCount: rw ? walletCount.get(rw) ?? 0 : 0,
      refereeWalletMatches: !!rw && args.wallets.get(ref)?.toLowerCase() === rw,
      programFundingVerified: fundingVerified,
    });
    if (a === "MAINNET_SIGNUP_ALLOCATION") mainnetIdx.add(i);
    const s = byState.get(a) ?? { rows: 0, points: 0 }; s.rows++; s.points += l.points; byState.set(a, s);
  }
  return {
    mainnetIdx,
    report: {
      rootCause: "award_signup_bonus() records SIGNUP_BONUS ledger rows without a chain id, so Mainnet settlement never counted them.",
      programFundingVerified: fundingVerified,
      totalRows: idx.length,
      totalPoints: idx.reduce((t, [l]) => t + l.points, 0),
      countedAsMainnet: [...mainnetIdx].reduce((t, i) => t + args.ledger[i].points, 0),
      states: [...byState.entries()].map(([state, v]) => ({ state, ...v })),
    },
  };
}
