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