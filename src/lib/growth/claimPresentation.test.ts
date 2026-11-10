import { describe, expect, it } from 'vitest';
import { claimStage, hasConfirmedClaim } from './claimPresentation';
describe('Growth claim feedback', () => {
  it('uses independently checked open and claimed rounds', () => {
    expect(claimStage('CLAIMABLE')).toBe(3);
    expect(claimStage('OPENS_LATER')).toBe(2);
    expect(claimStage('CLAIMED')).toBe(4);
  });
  it.each(['READ_FAILED','BLOCKED','ROOT_MISMATCH','PAUSED','NOT_PUBLISHED','EXPIRED'] as const)('does not imply eligibility for %s', status => expect(claimStage(status)).toBeNull());
  it('celebrates only receipt plus on-chain confirmed claims', () => {
    expect(hasConfirmedClaim([{epochId:4,outcome:'claimed',hash:'0x1'}])).toBe(true);
    expect(hasConfirmedClaim([{epochId:4,outcome:'unconfirmed',hash:'0x1'}])).toBe(false);
    expect(hasConfirmedClaim([{epochId:4,outcome:'skipped',reason:'already claimed'}])).toBe(false);
    expect(hasConfirmedClaim([{epochId:4,outcome:'reverted',hash:'0x1'}])).toBe(false);
    expect(hasConfirmedClaim([{epochId:4,outcome:'rejected',error:'cancelled'}])).toBe(false);
  });
});