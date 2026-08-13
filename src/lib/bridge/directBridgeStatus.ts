/**
 * Phase A1 — status vocabulary for the direct official bridge.
 *
 * Hard rule: a mined SOURCE receipt is NEVER cross-chain completion.
 * `Completed` requires explicit official bridge completion evidence, and
 * `Failed` / `Refunded` / `NeedsReview` require explicit evidence too — a
 * timeout alone can only ever produce `NeedsReview`.
 */

export type DirectBridgeStatus =
  | 'submitted'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'refunded'
  | 'needs_review';

export interface DirectBridgeEvidence {
  /** Source tx mined (status success). */
  sourceMined?: boolean;
  /** Source tx mined but reverted. */
  sourceReverted?: boolean;
  /** Explicit official-bridge completion evidence on the destination chain. */
  destinationCompletionEvidence?: boolean;
  /** Explicit official failure evidence. */
  destinationFailureEvidence?: boolean;
  /** Explicit refund evidence. */
  refundEvidence?: boolean;
  /** Waiting window exceeded — evidence-free. */
  timedOut?: boolean;
}

export function resolveDirectBridgeStatus(e: DirectBridgeEvidence): DirectBridgeStatus {
  if (e.sourceReverted) return 'failed';
  if (e.refundEvidence) return 'refunded';
  if (e.destinationFailureEvidence) return 'failed';
  if (e.destinationCompletionEvidence) return 'completed';
  if (e.timedOut && e.sourceMined) return 'needs_review';
  if (e.sourceMined) return 'processing';
  return 'submitted';
}

export const DIRECT_BRIDGE_STATUS_LABELS: Record<DirectBridgeStatus, string> = {
  submitted: 'Submitted',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
  refunded: 'Refunded',
  needs_review: 'Needs review',
};

/** Explicitly: source confirmation alone is not destination success. */
export function isCrossChainComplete(status: DirectBridgeStatus): boolean {
  return status === 'completed';
}
