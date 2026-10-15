import { describe, expect, it } from 'vitest';
import { signupPresentation } from './referralPresentation';
describe('signup presentation preserves approved eligibility rules', () => {
  it('old wallet-bound accounts do not become pending 100-point signups', () => {
    expect(signupPresentation('2026-07-23T00:00:00Z', 0, true)).toContain('before October 4, 2026');
  });
  it('recorded 100-point awards are not claimed FLOW', () => {
    expect(signupPresentation('2026-10-14T00:00:00Z', 100, true)).toContain('100 PTS recorded');
    expect(signupPresentation('2026-10-14T00:00:00Z', 100, true)).toContain('published open round');
  });
});