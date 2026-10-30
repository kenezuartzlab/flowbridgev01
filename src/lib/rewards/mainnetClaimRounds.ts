/**
 * Pure multi-round BOT Mainnet FLOW claim evaluation.
 *
 * Every round the wallet appears in is evaluated independently against live
 * on-chain reads. A single failed read or mismatched root blocks only that
 * round, never creates a claim. Totals are summed only from rounds whose
 * Merkle proof verified locally and whose window is open right now.
 */
import type { Hex } from 'viem';
import { prepareMerkleClaim, type MerkleClaimPreparation, type PublishedEpochState } from './merkleClaim';
import type { MainnetEntitlementMatch } from './mainnetEpochManifest';

export type RoundStatus =
  | 'CLAIMABLE'
  | 'OPENS_LATER'
  | 'EXPIRED'
  | 'CLAIMED'
  | 'ROOT_MISMATCH'
  | 'PAUSED'
  | 'NOT_PUBLISHED'
  | 'READ_FAILED'
  | 'BLOCKED';

export type ClaimablePreparation = Extract<MerkleClaimPreparation, { claimable: true }>;

export interface RoundView {
  epochId: number;
  index: number;
  account: Hex;
  amount: string;
  status: RoundStatus;
  message: string;
  claimStart: number | null;
  claimEnd: number | null;
  publicationTxHash: string | null;
  preparation: ClaimablePreparation | null;
}

export interface EpochRead {
  root: Hex;
  claimStart: number;
  claimEnd: number;
  cancelled: boolean;
  released: boolean;
  claimed: boolean;
}

export interface EvaluateRoundInput {
  chainId: number;
  distributor: Hex;
  entitlement: MainnetEntitlementMatch;
  epochCount: bigint;
  paused: boolean;
  /** null = the per-round read failed. */
  read: EpochRead | null;
  distributorBalance: string;
  totalReserved: string;
  nowSeconds: number;
  publicClaimsOpen: boolean;
  lastHistoricalEpoch: number;
}

export function evaluateRound(i: EvaluateRoundInput): RoundView {
  const { leaf, manifest, proof } = i.entitlement;
  const base: RoundView = {
    epochId: leaf.epochId,
    index: leaf.index,
    account: leaf.account as Hex,
    amount: leaf.amount,
    status: 'BLOCKED',
    message: '',
    claimStart: i.read?.claimStart ?? null,
    claimEnd: i.read?.claimEnd ?? null,
    publicationTxHash: manifest.publicationTxHash ?? null,
    preparation: null,
  };
  if (manifest.distributor.toLowerCase() !== i.distributor.toLowerCase()) {
    return { ...base, status: 'READ_FAILED', message: 'Round data does not match the canonical distributor.' };
  }
  if (BigInt(leaf.epochId) > i.epochCount) {
    return { ...base, status: 'NOT_PUBLISHED', message: 'Not published on BOT Mainnet yet.' };
  }
  if (!i.read) return { ...base, status: 'READ_FAILED', message: 'Live round state could not be read. Retry.' };
  if (i.read.root.toLowerCase() !== manifest.root.toLowerCase()) {
    return { ...base, status: 'ROOT_MISMATCH', message: 'On-chain root does not match — claim blocked.' };
  }
  if (i.read.claimed) return { ...base, status: 'CLAIMED', message: 'Already claimed on-chain.' };
  if (i.read.cancelled || i.read.released) return { ...base, status: 'BLOCKED', message: 'This round is no longer live.' };
  if (i.nowSeconds > i.read.claimEnd) return { ...base, status: 'EXPIRED', message: 'Claim window has closed.' };
  if (i.nowSeconds < i.read.claimStart) return { ...base, status: 'OPENS_LATER', message: 'Claim window has not opened yet.' };
  if (i.paused) return { ...base, status: 'PAUSED', message: 'The distributor is paused. Claims resume when it is unpaused.' };

  const epoch: PublishedEpochState = {
    epochId: leaf.epochId,
    root: i.read.root,
    claimStart: i.read.claimStart,
    claimEnd: i.read.claimEnd,
    cancelled: i.read.cancelled,
    released: i.read.released,
    distributorBalance: i.distributorBalance,
    totalReserved: i.totalReserved,
  };
  const prep = prepareMerkleClaim({
    chainId: i.chainId,
    distributor: i.distributor,
    epoch,
    leaf,
    proof,
    alreadyClaimed: false,
    nowSeconds: i.nowSeconds,
  });
  if (!prep.claimable) return { ...base, status: 'BLOCKED', message: prep.message };
  if (leaf.epochId > i.lastHistoricalEpoch && !i.publicClaimsOpen) {
    return { ...base, status: 'BLOCKED', message: 'Public FLOW claims are not open yet.' };
  }
  return { ...base, status: 'CLAIMABLE', message: 'Claimable now.', preparation: prep };
}

const ORDER: Record<RoundStatus, number> = {
  CLAIMABLE: 0, OPENS_LATER: 1, PAUSED: 2, READ_FAILED: 3, ROOT_MISMATCH: 4, BLOCKED: 5, NOT_PUBLISHED: 6, CLAIMED: 7, EXPIRED: 8,
};
const HISTORY: RoundStatus[] = ['CLAIMED', 'EXPIRED'];

export interface RoundsSummary {
  active: RoundView[];
  history: RoundView[];
  claimable: ClaimablePreparation[];
  /** Base units; sum of independently verified open, unclaimed leaves only. */
  totalClaimableWei: string;
}

export function summarizeRounds(rounds: RoundView[]): RoundsSummary {
  // One entry per (epoch, index): duplicate proofs can never double count.
  const seen = new Map<string, RoundView>();
  for (const r of rounds) {
    const k = `${r.epochId}:${r.index}`;
    if (!seen.has(k)) seen.set(k, r);
  }
  const uniq = [...seen.values()].sort(
    (a, b) => ORDER[a.status] - ORDER[b.status] || (a.claimEnd ?? Infinity) - (b.claimEnd ?? Infinity) || a.epochId - b.epochId,
  );
  const claimable = uniq.filter((r) => r.status === 'CLAIMABLE' && r.preparation).map((r) => r.preparation!);
  const total = claimable.reduce((s, p) => s + BigInt(p.amount), 0n);
  return {
    active: uniq.filter((r) => !HISTORY.includes(r.status)),
    history: uniq.filter((r) => HISTORY.includes(r.status)),
    claimable,
    totalClaimableWei: total.toString(),
  };
}

// ---------------------------------------------------------------- sequential

export type ClaimStepResult =
  | { epochId: number; outcome: 'claimed'; hash: string }
  | { epochId: number; outcome: 'reverted'; hash: string }
  | { epochId: number; outcome: 'unconfirmed'; hash: string }
  | { epochId: number; outcome: 'rejected'; error: string }
  | { epochId: number; outcome: 'skipped'; reason: string };

export interface SequentialClaimDeps {
  /** Re-check connected account + chain before each signature; throw to stop. */
  preflight: (prep: ClaimablePreparation) => Promise<void>;
  /** Re-read on-chain isClaimed before signing and after the receipt. */
  readClaimed: (prep: ClaimablePreparation) => Promise<boolean>;
  send: (prep: ClaimablePreparation) => Promise<string>;
  waitReceipt: (hash: string) => Promise<'success' | 'reverted'>;
  onStep?: (epochId: number, phase: 'signing' | 'submitted' | 'done', hash?: string) => void;
  shouldStop?: () => boolean;
}

/**
 * One claim at a time: the next signature is only requested after the prior
 * receipt succeeded and on-chain claimed state was re-read. Any rejection,
 * revert or unconfirmed state stops the run so the user can retry the rest.
 */
export async function runSequentialClaims(preps: ClaimablePreparation[], d: SequentialClaimDeps): Promise<ClaimStepResult[]> {
  const out: ClaimStepResult[] = [];
  for (const p of preps) {
    if (d.shouldStop?.()) break;
    try {
      if (await d.readClaimed(p)) {
        out.push({ epochId: p.epochId, outcome: 'skipped', reason: 'already claimed' });
        continue;
      }
      await d.preflight(p);
      d.onStep?.(p.epochId, 'signing');
      const hash = await d.send(p);
      d.onStep?.(p.epochId, 'submitted', hash);
      const status = await d.waitReceipt(hash);
      if (status !== 'success') {
        out.push({ epochId: p.epochId, outcome: 'reverted', hash });
        break;
      }
      const claimed = await d.readClaimed(p);
      d.onStep?.(p.epochId, 'done', hash);
      if (!claimed) {
        out.push({ epochId: p.epochId, outcome: 'unconfirmed', hash });
        break;
      }
      out.push({ epochId: p.epochId, outcome: 'claimed', hash });
    } catch (e: any) {
      out.push({ epochId: p.epochId, outcome: 'rejected', error: e?.shortMessage ?? e?.message ?? 'Cancelled' });
      break;
    }
  }
  return out;
}
