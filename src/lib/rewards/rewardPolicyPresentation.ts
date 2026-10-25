import type { FlowPointsV2Policy } from './flowPointsV2';
import { SIGNUP_BONUS_EFFECTIVE_AT, SIGNUP_BONUS_POINTS, REFERRER_SIGNUP_BONUS_POINTS } from './signupBonusPolicy';
import { MIN_OPS_CLAIM_FLOW } from './claimMinimumPolicy';
import { DEFAULT_FLOW_POINTS_V2_POLICY } from './flowPointsV2';

/** Read-only descriptor of executed policy. Never awards or authorizes claims. */
export function rewardPolicyPresentation(policy: FlowPointsV2Policy) {
  return {
    ...policy,
    signupEffectiveAt: SIGNUP_BONUS_EFFECTIVE_AT,
    signupPoints: SIGNUP_BONUS_POINTS,
    referrerSignupPoints: REFERRER_SIGNUP_BONUS_POINTS,
    signupMonthlyCap: DEFAULT_FLOW_POINTS_V2_POLICY.referralMonthlyCap,
    settlementMinimum: MIN_OPS_CLAIM_FLOW,
  };
}
export type RewardPolicyPresentation = ReturnType<typeof rewardPolicyPresentation>;