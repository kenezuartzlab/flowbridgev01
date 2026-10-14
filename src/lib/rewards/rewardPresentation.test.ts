import { describe, expect, it } from 'vitest';
import { computeRewardProgression } from './rewardProgression';
import { rewardPresentation } from './rewardPresentation';

const now = 1800000000;
const base = { ledger: [], reconciledPoints: 0, reviewHeldPoints: 0, historicalNonclaimable: 1000, reconciliationOk: true, storedFlowPoints: 1000, walletBound: true, allocations: [], nowSec: now };
describe('claim display uses published entitlement, not stored points', () => {
  it('1,000 stored points alone do not produce a claimable amount', () => {
    expect(rewardPresentation(computeRewardProgression(base)).claimable).toBe(0);
  });
  it('1,000 eligible points without a published round are not claimable', () => {
    const p = computeRewardProgression({ ...base, historicalNonclaimable: 0, reconciledPoints: 1000, ledger: [{ points: 1000, chainId: 677, fundingState: 'FUNDED', programId: 'CORE_SWAP' }] });
    expect(p.settlementReady).toBe(true);
    expect(rewardPresentation(p).claimable).toBe(0);
  });
  it('shows the actual open, unclaimed allocation', () => {
    const p = computeRewardProgression({ ...base, allocations: [{ epochId: 3, amountFlow: 1250, walletMatches: true, proofValid: true, onChain: true, claimed: false, claimStart: now - 10, claimEnd: now + 10 }] });
    expect(rewardPresentation(p).claimable).toBe(1250);
  });
  it('unavailable progression is not a zero balance', () => {
    expect(rewardPresentation(null).claimable).toBeNull();
  });
});