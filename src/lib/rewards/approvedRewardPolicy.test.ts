import { describe, it, expect } from 'vitest';
import { DEFAULT_FLOW_POINTS_V2_POLICY, coreSwapAward, isFlowPointsV2Active } from './flowPointsV2';
import { validateApprovedRewardPolicy, validRewardReservation } from './approvedRewardPolicy';
import { attributeSignupAward } from './signupAttribution';
import { SIGNUP_BONUS_POLICY_VERSION } from './signupBonusPolicy';

describe('V36.6 approved policy invariants', () => {
  it('pins the approved $5 threshold and rejects conflicting config under the same version', () => {
    expect(validateApprovedRewardPolicy(DEFAULT_FLOW_POINTS_V2_POLICY).minSwapUsd).toBe(5);
    expect(() => validateApprovedRewardPolicy({ ...DEFAULT_FLOW_POINTS_V2_POLICY, minSwapUsd: 1 })).toThrow();
  });
  it('enforces whole verified USD and the 1,000 daily cap', () => {
    expect(coreSwapAward(4.999, 0).award).toBe(0);
    expect(coreSwapAward(5.999, 0).award).toBe(5);
    expect(coreSwapAward(99.99, 999).award).toBe(1);
    expect(coreSwapAward(100, 1000).award).toBe(0);
    expect(() => validateApprovedRewardPolicy({ ...DEFAULT_FLOW_POINTS_V2_POLICY, dailyCoreSwapCap: 5000 })).toThrow();
  });
  it('does not apply V2 before its historical boundary', () => {
    expect(isFlowPointsV2Active('2026-08-20T14:59:59.999Z')).toBe(false);
    expect(isFlowPointsV2Active('2026-08-20T15:00:00.000Z')).toBe(true);
  });
  it('requires the exact reservation identity, program, wallet and amount', () => {
    const f = { ledgerId: 'l', userId: 'u', wallet: '0xabc', points: 100, program: 'SIGNUP_BONUS', reservation: { ledgerId: 'l', userId: 'u', wallet: '0xabc', points: 100, program: 'SIGNUP_BONUS' } };
    expect(validRewardReservation(f)).toBe(true);
    expect(validRewardReservation({ ...f, reservation: null })).toBe(false);
    for (const change of [{ userId: 'other' }, { ledgerId: 'other' }, { wallet: '0xdef' }, { points: 200 }, { program: 'CORE_SWAP' }]) {
      expect(validRewardReservation({ ...f, reservation: { ...f.reservation, ...change } })).toBe(false);
    }
  });
  it('rejects invalid dates, wallet changes and wrong signup amounts', () => {
    const facts = { reason: 'SIGNUP_BONUS_REFEREE', programId: 'SIGNUP_BONUS', chainId: null, fundingState: 'FUNDED', policyVersion: SIGNUP_BONUS_POLICY_VERSION, reservationId: 'r', ledgerWallet: '0xabc', refereeCreatedAt: '2026-10-04T01:00:00Z', refereeEmailVerified: true, recipientBoundWallet: '0xabc', refereeWalletAwardCount: 1, programFundingVerified: true, points: 100 };
    expect(attributeSignupAward(facts)).toBe('MAINNET_SIGNUP_ALLOCATION');
    expect(attributeSignupAward({ ...facts, refereeCreatedAt: 'invalid' })).toBe('ACCOUNT_BEFORE_PROGRAM');
    expect(attributeSignupAward({ ...facts, points: 50 })).toBe('WRONG_AMOUNT');
    expect(attributeSignupAward({ ...facts, recipientBoundWallet: '0xdef' })).toBe('WALLET_MISMATCH');
  });
});