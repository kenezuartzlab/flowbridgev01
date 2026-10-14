import type { RewardProgression } from './rewardProgression';

/** Display adapter only: never infers entitlement from a stored points balance. */
export function rewardPresentation(p: RewardProgression | null | undefined) {
  const claimable = p?.claimButton && p.lifecycle === 'CLAIMABLE_NOW' && p.allocation && !p.allocation.claimed
    ? p.allocation.amountFlow : null;
  return {
    claimable: p ? claimable ?? 0 : null,
    readiness: !p ? 'Checking claim eligibility…'
      : claimable !== null ? `${claimable.toLocaleString('en-US')} FLOW ready to claim`
      : p.settlementReady ? 'Minimum reached · awaiting payout round'
      : p.lifecycle === 'ALLOCATED_ON_CHAIN' ? 'Allocated · no open claim window'
      : `${p.availableTowardMinimum.toLocaleString('en-US')} / ${p.minimum.toLocaleString('en-US')} eligible PTS`,
  };
}