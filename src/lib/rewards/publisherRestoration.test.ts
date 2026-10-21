import { describe, it, expect } from 'vitest';
import { selectRestorableAttempt, type PublisherAttempt } from './publisherRecovery';
const hash = '0x' + 'a'.repeat(64);
const attempt = (over: Partial<PublisherAttempt>): PublisherAttempt => ({ id: 'a', operation_id: 'op', epoch_id: 3, root: hash, fingerprint: 'f', tx_hash: hash, phase: 'BROADCAST_PENDING', retry_safe: false, ...over });
describe('stuck attempt restoration', () => {
  it('restores an earlier-epoch attempt after its round mined and the live epoch advanced', () => {
    const stuck = attempt({ epoch_id: 3, phase: 'CONFIRMING' });
    expect(selectRestorableAttempt([stuck])).toBe(stuck);
  });
  it('never restores confirmed or retry-safe attempts', () => {
    expect(selectRestorableAttempt([attempt({ phase: 'CONFIRMED_VERIFIED' })])).toBeNull();
    expect(selectRestorableAttempt([attempt({ phase: 'CANCELLED', retry_safe: true })])).toBeNull();
    expect(selectRestorableAttempt([])).toBeNull();
    expect(selectRestorableAttempt(null)).toBeNull();
  });
  it('prefers the most recent stuck attempt when several epochs are listed newest-first', () => {
    const newer = attempt({ id: 'new', epoch_id: 4 });
    const older = attempt({ id: 'old', epoch_id: 3, phase: 'CONFIRMED_VERIFIED' });
    expect(selectRestorableAttempt([newer, older])).toBe(newer);
  });
});
