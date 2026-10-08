/**
 * V32.7 — read-only historical round indexing (pure).
 *
 * Rounds published on chain before the settlement-batch table existed get an
 * indexed discovery record built from LIVE chain truth plus a proof source
 * whose leaves must reproduce the on-chain root exactly. This is metadata only:
 * it never publishes, never changes a root/allocation/claim, and never creates
 * entitlement. A round whose proofs are unavailable is never fabricated.
 */
import type { Hex } from 'viem';

import { merkleClaimLeafHash, verifyMerkleProof } from './merkleClaim';
import type { OnchainEpoch, StoredBatch } from './settlementPlanner';

export const HISTORICAL_SOURCE = 'ON_CHAIN_HISTORICAL_IMPORT' as const;
export const BUILDER_SOURCE = 'SETTLEMENT_BUILDER' as const;
export type RoundSource = typeof HISTORICAL_SOURCE | typeof BUILDER_SOURCE;
export const CLAIM_DATA_UNAVAILABLE = 'CLAIM DATA UNAVAILABLE — RETRY';

export interface ProofSource { epochId: number; root: Hex; leaves: { index: number; account: Hex; amount: string; proof: readonly Hex[] }[] }
export interface IndexedRound extends StoredBatch { source: RoundSource }
export interface DriftField { field: 'root' | 'allocation' | 'claimStart' | 'claimEnd' | 'status'; local: string; chain: string }

export function roundKey(chainId: number, distributor: string, epochId: number) {
  return `${chainId}:${distributor.toLowerCase()}:${epochId}`;
}

/** Local vs chain comparison. Chain wins; any difference is ROUND_METADATA_DRIFT. */
export function detectRoundDrift(local: StoredBatch, chain: OnchainEpoch): DriftField[] {
  const d: DriftField[] = [];
  if (local.root.toLowerCase() !== chain.root.toLowerCase()) d.push({ field: 'root', local: local.root, chain: chain.root });
  if (BigInt(local.totalWei) !== chain.allocation) d.push({ field: 'allocation', local: local.totalWei, chain: chain.allocation.toString() });
  if (local.claimStart !== Number(chain.claimStart)) d.push({ field: 'claimStart', local: String(local.claimStart), chain: String(chain.claimStart) });
  if (local.claimEnd !== Number(chain.claimEnd)) d.push({ field: 'claimEnd', local: String(local.claimEnd), chain: String(chain.claimEnd) });
  if (chain.cancelled || chain.released) d.push({ field: 'status', local: 'PUBLISHED', chain: chain.cancelled ? 'CANCELLED' : 'RELEASED' });
  return d;
}

export type ImportResult =
  | { status: 'IMPORT'; record: IndexedRound }
  | { status: 'PROOF_UNAVAILABLE' | 'PROOF_MISMATCH' };

/** Build a historical record only when the proof source reproduces chain truth exactly. */
export function buildHistoricalImport(a: { chainId: number; distributor: Hex; epochId: number; chain: OnchainEpoch; proofSource: ProofSource | null }): ImportResult {
  const src = a.proofSource;
  if (!src || src.epochId !== a.epochId || !src.leaves.length) return { status: 'PROOF_UNAVAILABLE' };
  if (src.root.toLowerCase() !== a.chain.root.toLowerCase()) return { status: 'PROOF_MISMATCH' };
  let total = 0n;
  for (const l of src.leaves) {
    const leaf = merkleClaimLeafHash({ chainId: a.chainId, distributor: a.distributor, leaf: { epochId: a.epochId, index: l.index, account: l.account, amount: l.amount } });
    if (!verifyMerkleProof({ leaf, proof: l.proof, root: a.chain.root })) return { status: 'PROOF_MISMATCH' };
    total += BigInt(l.amount);
  }
  if (total !== a.chain.allocation) return { status: 'PROOF_MISMATCH' };
  return {
    status: 'IMPORT',
    record: {
      source: HISTORICAL_SOURCE, epochId: a.epochId, root: a.chain.root, totalWei: a.chain.allocation.toString(),
      claimStart: Number(a.chain.claimStart), claimEnd: Number(a.chain.claimEnd),
      leaves: src.leaves.map((l) => ({ index: l.index, account: l.account, amount: l.amount, proof: [...l.proof] })),
    },
  };
}

export type SyncAction =
  | { epochId: number; action: 'SKIP_EXISTING' }
  | { epochId: number; action: 'IMPORT'; record: IndexedRound }
  | { epochId: number; action: 'DRIFT'; code: 'ROUND_METADATA_DRIFT'; fields: DriftField[] }
  | { epochId: number; action: 'UNAVAILABLE'; reason: 'CHAIN_READ_FAILED' | 'PROOF_UNAVAILABLE' | 'PROOF_MISMATCH' };

/**
 * Idempotent plan: every on-chain round 1..epochCount gets exactly one action.
 * Existing local records are never duplicated; drifted ones are flagged, never
 * silently overwritten.
 */
export function planRoundIndexSync(a: {
  chainId: number; distributor: Hex; epochCount: number;
  local: StoredBatch[]; chainEpochs: Map<number, OnchainEpoch | null>; proofSources: ProofSource[];
}): SyncAction[] {
  const out: SyncAction[] = [];
  for (let id = 1; id <= a.epochCount; id++) {
    const chain = a.chainEpochs.get(id) ?? null;
    if (!chain) { out.push({ epochId: id, action: 'UNAVAILABLE', reason: 'CHAIN_READ_FAILED' }); continue; }
    const locals = a.local.filter((l) => l.epochId === id);
    const exact = locals.find((l) => detectRoundDrift(l, chain).length === 0);
    if (exact) { out.push({ epochId: id, action: 'SKIP_EXISTING' }); continue; }
    const sameRoot = locals.find((l) => l.root.toLowerCase() === chain.root.toLowerCase());
    if (sameRoot) { out.push({ epochId: id, action: 'DRIFT', code: 'ROUND_METADATA_DRIFT', fields: detectRoundDrift(sameRoot, chain) }); continue; }
    // Locals with other roots are unsigned rebuilt candidates — not drift.
    const r = buildHistoricalImport({ chainId: a.chainId, distributor: a.distributor, epochId: id, chain, proofSource: a.proofSources.find((p) => p.epochId === id) ?? null });
    out.push(r.status === 'IMPORT' ? { epochId: id, action: 'IMPORT', record: r.record } : { epochId: id, action: 'UNAVAILABLE', reason: r.status });
  }
  return out;
}

/** Per-wallet discovery over indexed records (only rounds that are live and drift-free). */
export function discoverWalletRounds(wallet: string, rounds: IndexedRound[]) {
  const w = wallet.toLowerCase();
  return rounds
    .slice().sort((x, y) => x.epochId - y.epochId)
    .flatMap((r) => { const leaf = r.leaves.find((l) => l.account.toLowerCase() === w); return leaf ? [{ epochId: r.epochId, root: r.root, allocationWei: r.totalWei, claimStart: r.claimStart, claimEnd: r.claimEnd, source: r.source, leaf }] : []; });
}

/** Display of a discovered round given live claimed state; claimed rounds never show a Claim button. */
export function roundClaimDisplay(a: { claimed: boolean; nowSec: number; claimStart: number; claimEnd: number }) {
  if (a.claimed) return { state: 'CLAIMED' as const, claimButton: false };
  if (a.nowSec < a.claimStart) return { state: 'NOT_OPEN' as const, claimButton: false };
  if (a.nowSec > a.claimEnd) return { state: 'CLOSED' as const, claimButton: false };
  return { state: 'CLAIMABLE' as const, claimButton: true };
}
