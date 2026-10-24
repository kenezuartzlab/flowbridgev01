import { describe, expect, it } from 'vitest';
import { payoutStatus } from './payoutStatus';
const base = { securityAccepted: false, evidenceBlocked: true, qualifiedFlow: 0, scheduleNeedsRenewal: true, readyForReview: false, confirmed: false };
describe('independent payout presentation states', () => {
  it('Round 3 zero eligible FLOW remains blocked independently of security acceptance', () => {
    expect(payoutStatus({ ...base, securityAccepted: true })).toMatchObject({ security: 'SECURITY READY', evidence: 'REWARD EVIDENCE UNDER REVIEW', batch: 'BATCH INELIGIBLE', schedule: 'SCHEDULE NEEDS RENEWAL', publication: 'PUBLICATION BLOCKED', nextAction: 'Re-check' });
  });
  it('a software release hold does not describe proven rewards as unverified', () => {
    expect(payoutStatus({ ...base, evidenceBlocked: false, qualifiedFlow: 1122 })).toMatchObject({ security: 'SECURITY BLOCKED', evidence: 'REWARD EVIDENCE VERIFIED', batch: 'BATCH ELIGIBLE', nextAction: 'Re-check' });
  });
  it('a valid approved schedule never implies on-chain publication', () => {
    expect(payoutStatus({ ...base, securityAccepted: true, evidenceBlocked: false, qualifiedFlow: 1122, scheduleNeedsRenewal: false, readyForReview: true }).publication).toBe('AWAITING AUTHORIZED SIGNATURE');
  });
});