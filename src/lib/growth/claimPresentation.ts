import type { ClaimStepResult, RoundStatus } from '@/lib/rewards/mainnetClaimRounds';
/** Presentation only; canonical round preparation still owns eligibility. */
export function claimStage(status: RoundStatus): number | null {
  if (status === 'CLAIMED') return 4;
  if (status === 'CLAIMABLE') return 3;
  if (status === 'OPENS_LATER') return 2;
  return null;
}
export function hasConfirmedClaim(results: readonly ClaimStepResult[]): boolean {
  return results.some(r => r.outcome === 'claimed');
}
export const CLAIM_STAGES = ['Verified', 'Funded', 'Published', 'Claim open', 'Claimed'] as const;