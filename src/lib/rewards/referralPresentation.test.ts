import { describe, expect, it } from 'vitest';
import { signupDisplayState } from './referralPresentation';
describe('signup presentation preserves approved eligibility rules', () => {
  it('old wallet-bound accounts do not become pending 100-point signups', () => {
    expect(signupDisplayState('2026-07-23T00:00:00Z', 0, true)).toBe('LEGACY_EXCLUDED');
  });
  it('recorded 100-point awards are not claimed FLOW', () => {
    expect(signupDisplayState('2026-10-14T00:00:00Z', 100, true)).toBe('RECORDED');
  });
});