import { describe, expect, it } from 'vitest';
import { buildVoterRewardReadMessage, validateVoterRewardReadMessage } from './voterRewardAccess';
import { buildOwnershipMessage, validateOwnershipMessage } from '@/lib/wallet/ownershipMessage';

const fields = { address: '0x2222222222222222222222222222222222222222', nonce: 'a'.repeat(48), domain: 'flowbridge.space', uri: 'https://flowbridge.space', chainId: 677, issuedAt: '2026-11-22T07:29:00Z' };
const expected = { wallet: fields.address, nonce: fields.nonce, chainId: 677, requestOrigin: fields.uri, nowMs: Date.parse(fields.issuedAt) };

describe('private voter reward read proof', () => {
  it('accepts only the canonical reward read message', () => expect(validateVoterRewardReadMessage(buildVoterRewardReadMessage(fields), expected)).toBe(true));
  it('rejects generic ownership proofs for private reads', () => expect(validateVoterRewardReadMessage(buildOwnershipMessage(fields), expected)).toBe(false));
  it('cannot use a read signature to authorize the existing payout endpoint', () => expect(validateOwnershipMessage(buildVoterRewardReadMessage(fields), expected)).toBe(false));
  it.each([
    { ...expected, wallet: '0x3333333333333333333333333333333333333333' },
    { ...expected, nonce: 'b'.repeat(48) },
    { ...expected, requestOrigin: 'https://attacker.example' },
    { ...expected, requestOrigin: null },
    { ...expected, chainId: 56 },
    { ...expected, nowMs: expected.nowMs + 300001 },
  ])('rejects altered wallet, nonce, origin, network or expired proof', altered => {
    expect(validateVoterRewardReadMessage(buildVoterRewardReadMessage(fields), altered)).toBe(false);
  });
});