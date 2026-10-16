import { describe, expect, it } from 'vitest';
import { rewardPolicyPresentation } from './rewardPolicyPresentation';
import { DEFAULT_FLOW_POINTS_V2_POLICY, coreSwapAward } from './flowPointsV2';

describe('unified portal policy matches the executed rules', () => {
  const p = rewardPolicyPresentation(DEFAULT_FLOW_POINTS_V2_POLICY);
  it('uses the $5 qualifying swap minimum', () => { expect(p.minSwapUsd).toBe(5); expect(coreSwapAward(4.99,0,p).award).toBe(0); });
  it('earns one point per whole verified USD', () => { expect(coreSwapAward(5.99,0,p).award).toBe(5); });
  it('shows 100 PTS for an eligible signup', () => { expect(p.signupPoints).toBe(100); });
  it('shows 100 PTS for an eligible referrer signup', () => { expect(p.referrerSignupPoints).toBe(100); });
  it('requires 1000 funded Points for settlement', () => { expect(p.settlementMinimum).toBe(1000); });
  it('uses the configured cap rather than an obsolete rolling cap', () => { const custom = rewardPolicyPresentation({...DEFAULT_FLOW_POINTS_V2_POLICY,dailyCoreSwapCap:123}); expect(custom.dailyCoreSwapCap).toBe(123); expect(coreSwapAward(200,100,custom).award).toBe(23); });
  it('uses actual configured milestone amounts', () => { const custom=rewardPolicyPresentation({...DEFAULT_FLOW_POINTS_V2_POLICY,referralMilestoneFirstSwap:17,referralMonthlyCap:7}); expect(custom.referralMilestoneFirstSwap).toBe(17); expect(custom.referralMonthlyCap).toBe(7); });
});