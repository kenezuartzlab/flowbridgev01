import { describe, expect, it } from 'vitest';
import { isCrossChainComplete, resolveDirectBridgeStatus } from './directBridgeStatus';

describe('Phase A1 direct bridge status', () => {
  it('a mined source receipt alone is Processing, never Completed', () => {
    const s = resolveDirectBridgeStatus({ sourceMined: true });
    expect(s).toBe('processing');
    expect(isCrossChainComplete(s)).toBe(false);
  });

  it('unmined source is Submitted', () => {
    expect(resolveDirectBridgeStatus({})).toBe('submitted');
  });

  it('Completed requires explicit official completion evidence', () => {
    expect(
      resolveDirectBridgeStatus({ sourceMined: true, destinationCompletionEvidence: true }),
    ).toBe('completed');
  });

  it('timeout alone never yields Failed or Refunded', () => {
    expect(resolveDirectBridgeStatus({ sourceMined: true, timedOut: true })).toBe('needs_review');
  });

  it('failure and refund need explicit evidence', () => {
    expect(resolveDirectBridgeStatus({ sourceReverted: true })).toBe('failed');
    expect(
      resolveDirectBridgeStatus({ sourceMined: true, destinationFailureEvidence: true }),
    ).toBe('failed');
    expect(resolveDirectBridgeStatus({ sourceMined: true, refundEvidence: true })).toBe('refunded');
  });
});
