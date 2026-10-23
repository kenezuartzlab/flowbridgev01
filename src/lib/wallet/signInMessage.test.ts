import { describe, expect, it } from 'vitest';
import { buildSignInMessage, validateSignInMessage } from './signInMessage';
const f = { address: '0x' + '1'.repeat(40), nonce: 'a'.repeat(48), domain: 'flowbridge.space', uri: 'https://flowbridge.space', chainId: 677, issuedAt: '2026-10-23T04:00:00.000Z' };
const expected = { wallet: f.address, nonce: f.nonce, requestOrigin: f.uri, nowMs: Date.parse(f.issuedAt) };
describe('wallet sign-in origin and structure', () => {
  it('supports canonical and compact TokenPocket texts without changing signing modes', () => {
    for (const compact of [false, true]) expect(validateSignInMessage(buildSignInMessage(f, compact), expected)).toBe(true);
  });
  it('rejects another site, frame origin, wallet, nonce, modified text, missing fields and expired proof', () => {
    for (const compact of [false, true]) {
      const m = buildSignInMessage(f, compact);
      expect(validateSignInMessage(m, { ...expected, requestOrigin: 'https://attacker.invalid' })).toBe(false);
      expect(validateSignInMessage(m, { ...expected, requestOrigin: null })).toBe(false);
      expect(validateSignInMessage(m, { ...expected, wallet: '0x' + '2'.repeat(40) })).toBe(false);
      expect(validateSignInMessage(m, { ...expected, nonce: 'b'.repeat(48) })).toBe(false);
      expect(validateSignInMessage(m + '\nextra', expected)).toBe(false);
      expect(validateSignInMessage(m.replace(/URI: .+\n/, ''), expected)).toBe(false);
      expect(validateSignInMessage(m, { ...expected, nowMs: expected.nowMs + 300001 })).toBe(false);
    }
  });
});