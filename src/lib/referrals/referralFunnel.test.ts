import { describe, expect, it } from 'vitest';
import { buildReferralFunnel } from './referralFunnel';
describe('referral funnel', () => {
  it('a relationship alone is not a funded reward', () => {
    const f = buildReferralFunnel([{ emailVerified: false, walletBound: false, qualified: false, awaitingFunding: false }]);
    expect(f.signedUp).toBe(1);
    expect(f.fundedEligible).toBe(0);
  });
  it('excluded referrals are counted by reason and never as funded', () => {
    const f = buildReferralFunnel([{ emailVerified: true, walletBound: true, qualified: true, awaitingFunding: false, exclusionReason: 'Wallet changed' }]);
    expect(f.fundedEligible).toBe(0);
    expect(f.excluded).toEqual([{ reason: 'Wallet changed', count: 1 }]);
  });
});
