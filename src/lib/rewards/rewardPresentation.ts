import type { RewardProgression } from './rewardProgression';
import { buildRewardsSummary } from './rewardsSummary';

/** Display adapter only: never infers entitlement from a stored points balance. */
export function rewardPresentation(p: RewardProgression | null | undefined, nowSec = Math.floor(Date.now() / 1000)) {
  if (!p) return { claimable: null, readiness: 'Checking claim eligibility…', summary: null };
  const s = buildRewardsSummary({ progression: p, nowSec });
  const claimable = s.claimableNow > 0 ? s.claimableNow : null;
  const f = (n: number) => n.toLocaleString('en-US');
  return {
    claimable: claimable ?? 0,
    summary: s,
    readiness: claimable !== null ? `${f(claimable)} FLOW available to claim`
      : s.blocker === 'AWAITING_PUBLICATION' ? 'Qualified · awaiting settlement publication'
      : s.blocker === 'AWAITING_OPEN' ? 'Allocation published · claim not open yet'
      : s.blocker === 'ROUND_EXPIRED' ? 'Claim window closed'
      : s.blocker === 'UNDER_REVIEW' ? `${f(s.eligibleFundedUnallocated)} FLOW funded · held for evidence review`
      : `${f(s.eligibleFundedUnallocated)} FLOW verified · awaiting payout approval`,
  };
}
