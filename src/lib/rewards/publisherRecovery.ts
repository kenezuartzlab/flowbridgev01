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
export function retryablePublication(state: string, reconciled: boolean) {
  return reconciled && (state === 'CANCELLED' || state === 'REVERTED');
}