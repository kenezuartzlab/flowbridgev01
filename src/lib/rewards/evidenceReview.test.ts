import { describe, expect, it } from 'vitest';
import { canDecideException, isAcceptedProvenance, validateExceptionProposal } from './evidenceReview';

describe('historical evidence exception review', () => {
  it('accepts only verified or exception-approved provenance', () => {
    expect(isAcceptedProvenance('VERIFIED')).toBe(true);
    expect(isAcceptedProvenance('EXCEPTION_APPROVED')).toBe(true);
    expect(isAcceptedProvenance('PENDING')).toBe(false);
    expect(isAcceptedProvenance(null)).toBe(false);
  });
  it('requires a rationale and an uncertainty statement', () => {
    expect(validateExceptionProposal({ rationale: 'short', uncertainty: 'none known' }).ok).toBe(false);
    expect(validateExceptionProposal({ rationale: 'Verified Router V3 receipt; price from pool at block', uncertainty: '' }).ok).toBe(false);
    expect(validateExceptionProposal({ rationale: 'Verified Router V3 receipt; price from pool at block', uncertainty: 'No archived quote' }).ok).toBe(false);
    expect(validateExceptionProposal({ rationale: 'Verified Router V3 receipt; price from pool at block', uncertainty: 'No archived quote', priceSource: 'BDEX pool reserves at block 123' }).ok).toBe(true);
  });
  it('blocks self-approval and non-super-admin decisions', () => {
    expect(canDecideException({ status: 'PROPOSED', proposedBy: 'a' }, { userId: 'a', role: 'super_admin' }).ok).toBe(false);
    expect(canDecideException({ status: 'PROPOSED', proposedBy: 'a' }, { userId: 'b', role: 'admin' }).ok).toBe(false);
    expect(canDecideException({ status: 'APPROVED', proposedBy: 'a' }, { userId: 'b', role: 'super_admin' }).ok).toBe(false);
    expect(canDecideException({ status: 'PROPOSED', proposedBy: 'a' }, { userId: 'b', role: 'super_admin' }).ok).toBe(true);
  });
});
