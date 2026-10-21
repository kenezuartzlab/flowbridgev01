/** Closed-list cancellation evidence. Unknown provider failures never authorize a resend. */
export function isPublisherCancellation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; cause?: unknown; error?: unknown; data?: { originalError?: unknown } };
  return e.code === 4001 || e.code === '4001' || e.code === 'ACTION_REJECTED'
    || (e.cause !== error && isPublisherCancellation(e.cause))
    || (e.error !== error && isPublisherCancellation(e.error))
    || isPublisherCancellation(e.data?.originalError);
}
export type PublisherState = 'READY' | 'VALIDATING' | 'AWAITING_WALLET' | 'CANCELLED' | 'BROADCAST_PENDING' | 'CONFIRMING' | 'CONFIRMED' | 'REVERTED' | 'RECOVERY_REQUIRED';
export interface PublisherAttempt { id: string; operation_id: string; epoch_id: number; root: string; fingerprint: string; tx_hash: string | null; phase: string; retry_safe: boolean; }
/** A stuck attempt stays recoverable for ANY epoch, even after the mined round advanced the live epoch counter. */
export function selectRestorableAttempt(attempts: PublisherAttempt[] | null | undefined): PublisherAttempt | null {
  return attempts?.find((a) => a.phase !== 'CONFIRMED_VERIFIED' && !a.retry_safe) ?? null;
}
export function retryablePublication(state: string, reconciled: boolean) {
  return reconciled && (state === 'CANCELLED' || state === 'REVERTED');
}