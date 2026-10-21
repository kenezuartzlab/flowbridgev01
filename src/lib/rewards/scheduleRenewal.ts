import { keccak256, toHex, type Hex } from 'viem';
import { immutableBatchCalldata, revalidateImmutableBatch, type ImmutableBatch } from './immutableBatch';
import type { prepareSettlementBatch } from './settlementPlanner';

export function validClaimSchedule(nowSec: number, minPublishDelay: number) {
  if (!Number.isSafeInteger(nowSec) || nowSec < 0 || !Number.isSafeInteger(minPublishDelay) || minPublishDelay < 86400) throw new Error('Live contract timing unavailable');
  const claimStart = Math.ceil((nowSec + minPublishDelay + 7200) / 3600) * 3600;
  return { claimStart, claimEnd: claimStart + 30 * 86400, signBefore: claimStart - minPublishDelay };
}

/** Schedule-only proposal. Changed economics never inherit the old approval. */
export function proposeScheduleRenewal(candidate: ReturnType<typeof prepareSettlementBatch>, stored: ImmutableBatch, nowSec: number, delay: number) {
  const schedule = validClaimSchedule(nowSec, delay);
  const fingerprint = keccak256(toHex(JSON.stringify([stored.id, stored.fingerprint, stored.epochId, stored.root, stored.totalWei, schedule.claimStart, schedule.claimEnd])));
  const replacement = { ...stored, ...schedule, fingerprint };
  const checked = revalidateImmutableBatch(candidate, replacement, nowSec, delay);
  const needed = stored.claimStart < nowSec + delay || stored.claimEnd <= nowSec;
  return {
    needed, ready: needed && checked.status === 'READY_FOR_PUBLISHER_REVIEW' && !stored.published,
    originalBatchId: stored.id, originalFingerprint: stored.fingerprint,
    epochId: stored.epochId, root: stored.root, totalWei: stored.totalWei, wallets: stored.leaves.length,
    oldClaimStart: stored.claimStart, oldClaimEnd: stored.claimEnd,
    ...schedule, fingerprint, calldata: immutableBatchCalldata(replacement),
    blockers: checked.checks.filter(c => !c.pass).map(c => c.id),
    authorization: 'SUPER_ADMIN_EXPLICIT_SCHEDULE_APPROVAL' as const,
  };
}

export type RenewalProposal = ReturnType<typeof proposeScheduleRenewal>;
export function payoutNextAction(input: { pending: boolean; hash?: string | null; renewalNeeded: boolean; renewalReady: boolean; ready: boolean; reviewed: boolean; authorized: boolean }) {
  if (input.pending) return input.hash ? 'RE_CHECK' : 'RECOVER';
  if (input.renewalNeeded) return input.renewalReady && input.authorized ? 'REVIEW_RENEWAL' : 'RE_CHECK';
  if (!input.ready || !input.authorized) return 'RE_CHECK';
  return input.reviewed ? 'SIGN' : 'REVIEW';
}
export function renewalFingerprint(value: string): Hex {
  if (!/^0x[0-9a-f]{64}$/i.test(value)) throw new Error('Invalid renewal identity');
  return value as Hex;
}