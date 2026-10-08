import { describe, expect, it } from 'vitest';

import { leafMeetsClaimMinimum, MAINNET_CLAIM_CANARY_EXCEPTION } from './claimMinimumPolicy';
import { CLAIM_WINDOW_POLICY, claimLifecycle, PUBLIC_MAINNET_FLOW_CLAIMS, settlementEligibility, type EligibilityRow } from './publicClaimPolicy';

const row = (o: Partial<EligibilityRow>): EligibilityRow => ({ wallet: '0x' + '1'.repeat(40), classification: 'MATCH', pendingReview: 0, fundedPoints: 0, authoritative: 0, alreadySettledPoints: 0, ...o });
const funded = (n: number) => row({ fundedPoints: n, authoritative: n });
const now = 2_000_000_000;
const alloc = (o: Record<string, unknown> = {}) => ({ epochId: 3, amountFlow: 1500, walletMatches: true, proofValid: true, onChain: true, claimed: false, claimStart: now - 10, claimEnd: now + 1000, ...o });
const base = { earnedPoints: 1500, fundedEligiblePoints: 1500, alreadySettledPoints: 0, nowSec: now };

describe('V33 settlement eligibility', () => {
  it('999 FLOW not eligible', () => expect(settlementEligibility([funded(999)]).wallets).toBe(0));
  it('1,000 FLOW eligible', () => expect(settlementEligibility([funded(1000)])).toMatchObject({ wallets: 1, totalFlow: 1000 }));
  it('1,500 FLOW eligible', () => expect(settlementEligibility([funded(1500)]).totalFlow).toBe(1500));
  it('Testnet-only 2,000 points not eligible (no funded Mainnet rows)', () => expect(settlementEligibility([row({ fundedPoints: 0, authoritative: 2000 })]).wallets).toBe(0));
  it('historical unsupported 2,000 not eligible', () => expect(settlementEligibility([row({ fundedPoints: 2000, authoritative: 2000, classification: 'REVIEWED_NONCLAIMABLE_HISTORICAL' })]).wallets).toBe(0));
  it('unfunded 2,000 not eligible', () => expect(settlementEligibility([row({ fundedPoints: 0, authoritative: 2000 })]).wallets).toBe(0));
  it('review-held not eligible', () => expect(settlementEligibility([row({ fundedPoints: 2000, authoritative: 2000, pendingReview: 5 })]).wallets).toBe(0));
  it('already-settled points do not count twice', () => expect(settlementEligibility([row({ fundedPoints: 1500, authoritative: 1500, alreadySettledPoints: 1000 })]).wallets).toBe(0));
  it('zero eligible reports no batch required', () => expect(settlementEligibility([]).status).toBe('NO_PUBLIC_BATCH_REQUIRED_YET'));
});

describe('V33 claim lifecycle', () => {
  it('public flag is OFF', () => expect(PUBLIC_MAINNET_FLOW_CLAIMS).toBe(false));
  it('eligible but not allocated: no claim button', () => {
    expect(claimLifecycle({ ...base, allocation: null })).toMatchObject({ state: 'ELIGIBLE_FOR_SETTLEMENT', claimButton: false, label: 'Eligible for next settlement batch' });
  });
  it('below minimum shows progress', () => expect(claimLifecycle({ ...base, fundedEligiblePoints: 350, allocation: null }).label).toBe('350 / 1,000 FLOW toward minimum claim'));
  it('allocated but window not open: disabled', () => {
    expect(claimLifecycle({ ...base, publicFlag: true, allocation: alloc({ claimStart: now + 100 }) })).toMatchObject({ state: 'ALLOCATED_ON_CHAIN', claimButton: false });
  });
  it('allocated + window open + flag ON: claim available', () => {
    expect(claimLifecycle({ ...base, publicFlag: true, allocation: alloc() })).toMatchObject({ state: 'CLAIMABLE_NOW', claimButton: true, label: 'Claim 1,500 FLOW' });
  });
  it('public flag OFF: public claims unavailable', () => expect(claimLifecycle({ ...base, allocation: alloc() }).claimButton).toBe(false));
  it('wrong wallet denied', () => expect(claimLifecycle({ ...base, publicFlag: true, allocation: alloc({ walletMatches: false }) }).claimButton).toBe(false));
  it('already claimed denied', () => expect(claimLifecycle({ ...base, publicFlag: true, allocation: alloc({ claimed: true }) })).toMatchObject({ state: 'CLAIMED', claimButton: false }));
  it('canary exception cannot leak into future rounds', () => {
    const e = MAINNET_CLAIM_CANARY_EXCEPTION;
    expect(leafMeetsClaimMinimum(e.epochId, e.wallet, e.points)).toBe(true);
    expect(leafMeetsClaimMinimum(3, e.wallet, e.points)).toBe(false);
    expect(leafMeetsClaimMinimum(4, e.wallet, 999)).toBe(false);
  });
  it('claim window policy is owner-approved at 30 days', () => {
    expect(CLAIM_WINDOW_POLICY.ownerApproved).toBe(true);
    expect(CLAIM_WINDOW_POLICY.status).toBe('APPROVED');
    expect(CLAIM_WINDOW_POLICY.currentSeconds).toBe(2_592_000);
  });
});
