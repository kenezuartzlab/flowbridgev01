import { encodeFunctionData, type Hex } from 'viem';
import { PUBLISH_EPOCH_ABI, type StoredBatch, type prepareSettlementBatch } from './settlementPlanner';

export type ImmutableBatch = StoredBatch & { id: string; fingerprint: string; published: boolean };
type Candidate = ReturnType<typeof prepareSettlementBatch>;

/** Eligibility is rebuilt, but an existing batch's identity and window never drift. */
export function revalidateImmutableBatch(candidate: Candidate, stored: ImmutableBatch, nowSec: number, delay: number): Candidate {
  const same = candidate.epochId === stored.epochId && candidate.batch?.root === stored.root
    && candidate.batch.totalWei === stored.totalWei
    && JSON.stringify(candidate.batch.leaves.map(l => [l.index,l.account.toLowerCase(),l.amount,l.proof])) === JSON.stringify(stored.leaves.map(l => [l.index,l.account.toLowerCase(),l.amount,l.proof]));
  const checks = [...candidate.checks,
    { id: 'IMMUTABLE_ALLOCATION', pass: same && !stored.published, detail: 'stored recipients, proofs and funded allocation match fresh eligibility' },
    { id: 'STORED_CLAIM_WINDOW', pass: stored.claimEnd > stored.claimStart && stored.claimStart >= nowSec + delay, detail: 'Stored claim window must satisfy the live contract minimum publication delay. An expired window requires separately authorized batch replacement; re-review cannot change it.' },
  ];
  const ready = candidate.status === 'READY_FOR_PUBLISHER_REVIEW' && checks.every(c => c.pass);
  return { ...candidate, status: ready ? 'READY_FOR_PUBLISHER_REVIEW' : 'BLOCKED',
    reason: ready ? null : checks.filter(c => !c.pass).map(c => c.id).join(', '),
    batch: candidate.batch ? { ...candidate.batch, root: stored.root, totalWei: stored.totalWei, leaves: same ? candidate.batch.leaves : [] } : null, fingerprint: stored.fingerprint as Hex, claimStart: stored.claimStart, claimEnd: stored.claimEnd, checks,
    tx: ready && candidate.tx ? { ...candidate.tx, data: immutableBatchCalldata(stored) } : null,
  };
}

export function immutableBatchCalldata(stored: StoredBatch): Hex {
  return encodeFunctionData({ abi: PUBLISH_EPOCH_ABI, functionName: 'publishEpoch', args: [stored.root,BigInt(stored.totalWei),BigInt(stored.claimStart),BigInt(stored.claimEnd)] });
}

/** Expand JSON exponent notation without truncating at a decimal point. */
export function integerWei(value: string | number): string {
  const text = String(value);
  if (text.length > 100) throw new Error('Invalid stored allocation');
  const match = /^(\d+)(?:\.(\d+))?(?:e\+?(\d+))?$/i.exec(text);
  if (!match) throw new Error('Invalid stored allocation');
  const fraction = match[2] ?? '';
  const shift = Number(match[3] ?? 0) - fraction.length;
  if (Number(match[3] ?? 0) > 77 || match[1].length + fraction.length + Math.max(shift,0) > 78) throw new Error('Invalid stored allocation');
  if (shift < 0 && !('' + fraction).endsWith('0'.repeat(-shift))) throw new Error('Non-integer allocation');
  const digits = match[1] + fraction;
  return BigInt(shift >= 0 ? digits + '0'.repeat(shift) : digits.slice(0,shift)).toString();
}
/**
 * While an unpublished batch is stored, only approvals confirmed at or before its
 * creation for wallets in its leaves belong to it; every other confirmed, unlinked
 * approval is queued for the next round (never dropped, never merged in).
 */
export function partitionApprovalsForStoredBatch<A extends { wallet: string; confirmed_at: string | null }>(
  approvals: readonly A[], stored: { createdAt: string; accounts: readonly string[] } | null,
): { frozen: A[]; queuedNext: A[] } {
  if (!stored) return { frozen: [...approvals], queuedNext: [] };
  const created = Date.parse(stored.createdAt);
  const accounts = new Set(stored.accounts.map(a => a.toLowerCase()));
  const frozen: A[] = []; const queuedNext: A[] = [];
  for (const a of approvals) {
    const at = a.confirmed_at ? Date.parse(a.confirmed_at) : NaN;
    (Number.isFinite(at) && Number.isFinite(created) && at <= created && accounts.has(a.wallet.toLowerCase()) ? frozen : queuedNext).push(a);
  }
  return { frozen, queuedNext };
}
