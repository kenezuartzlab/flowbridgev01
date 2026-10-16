import { describe, expect, it } from 'vitest';
import { normalizeCode, readPending, PENDING_REFERRAL_TTL_MS } from './pendingReferral';
describe('pending referral', () => {
  it('rejects malformed codes', () => { expect(normalizeCode('../x')).toBeNull(); expect(normalizeCode(' fb-ab12c ')).toBe('FB-AB12C'); });
  it('expires after 30 days', () => {
    const raw = JSON.stringify({ code: 'FB-AB12C', capturedAt: 0 });
    expect(readPending(raw, PENDING_REFERRAL_TTL_MS - 1)?.code).toBe('FB-AB12C');
    expect(readPending(raw, PENDING_REFERRAL_TTL_MS + 1)).toBeNull();
  });
});
