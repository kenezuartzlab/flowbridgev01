import { beforeEach, describe, expect, it, vi } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { buildOwnershipMessage, validateOwnershipMessage } from './ownershipMessage';
import { buildSignInMessage } from './signInMessage';
const state = vi.hoisted(() => ({ used: false, expires: '', limit: vi.fn() }));
const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const wallet = account.address.toLowerCase();
vi.mock('./requestLimit.server', () => ({ checkWalletRequestLimit: state.limit }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { from: (table: string) => {
  if (table !== 'siwe_nonces') throw new Error('Ownership must not read account data');
  let update = false;
  let cutoff = '';
  const q = { eq: () => q, is: () => q, gt: (_f: string, value: string) => { cutoff = value; return q; },
    update: () => { update = true; return q; },
    select: () => update ? Promise.resolve().then(() => {
      if (state.used || state.expires <= cutoff) return { data: [] };
      state.used = true; return { data: [{ id: 'n1' }] };
    }) : q,
    maybeSingle: async () => ({ data: { id: 'n1', wallet_address: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8', expires_at: state.expires, used_at: state.used ? new Date().toISOString() : null } }),
  }; return q;
} } }));
import { Route } from '@/routes/api/public/wallet-proof';
const nonce = 'a'.repeat(48);
const fields = () => ({ address: wallet, nonce, domain: 'flowbridge.space', uri: 'https://flowbridge.space', chainId: 677, issuedAt: new Date().toISOString() });
async function call(compact = false, overrides: Record<string, unknown> = {}, origin = 'https://flowbridge.space') {
  const message = buildOwnershipMessage(fields(), compact);
  const signature = await account.signMessage({ message });
  const handler = (Route.options as unknown as { server: { handlers: { POST: (p: { request: Request }) => Promise<Response> } } }).server.handlers.POST;
  return handler({ request: new Request('https://flowbridge.space/api/public/wallet-proof', { method: 'POST', headers: { origin }, body: JSON.stringify({ walletAddress: wallet, message, signature, nonce, chainId: 677, ...overrides }) }) });
}
beforeEach(() => { state.used = false; state.expires = new Date(Date.now() + 60000).toISOString(); state.limit.mockReset().mockResolvedValue(null); });
describe('public trading ownership is purpose-limited and single-use', () => {
  it.each([false, true])('accepts real standard/TokenPocket signatures without registration: compact=%s', async compact => {
    expect(await (await call(compact)).json()).toEqual({ verified: true, purpose: 'TRADING_OWNERSHIP', chainId: 677 });
  });
  it('rejects sign-in proof instead of minting a session', async () => {
    const message = buildSignInMessage(fields());
    expect((await call(false, { message, signature: await account.signMessage({ message }) })).status).toBe(400);
    expect(state.used).toBe(false);
  });
  it('eight simultaneous requests consume one nonce only', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => call()));
    expect(results.filter(r => r.status === 200)).toHaveLength(1);
  });
  it('rejects replay and expired nonce', async () => {
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(400);
    state.used = false; state.expires = new Date(Date.now() - 1000).toISOString();
    expect((await call()).status).toBe(400);
  });
  it('rejects forged signatures, wrong-origin, and wrong-chain', async () => {
    expect((await call(false, { signature: '0x' + '1'.repeat(130) })).status).toBe(401);
    expect((await call(false, {}, 'https://attacker.invalid')).status).toBe(400);
    expect((await call(false, { chainId: 56 })).status).toBe(400);
    expect(state.used).toBe(false);
  });
  it('rate limits without consuming proof', async () => {
    state.limit.mockResolvedValue(new Response(null, { status: 429 }));
    expect((await call()).status).toBe(429); expect(state.used).toBe(false);
  });
  it.each([false, true])('validates canonical fields and timestamps: compact=%s', compact => {
    const f = fields(), message = buildOwnershipMessage(f, compact);
    const expected = { wallet, nonce, chainId: 677, requestOrigin: f.uri, nowMs: Date.parse(f.issuedAt) };
    expect(validateOwnershipMessage(message, expected)).toBe(true);
    for (const change of [{ wallet: '0x' + '2'.repeat(40) }, { nonce: 'b'.repeat(48) }, { chainId: 999 }, { requestOrigin: null }, { nowMs: expected.nowMs + 300001 }, { nowMs: expected.nowMs - 60001 }]) {
      expect(validateOwnershipMessage(message, { ...expected, ...change })).toBe(false);
    }
    expect(validateOwnershipMessage(message + '\nNonce: ' + nonce, expected)).toBe(false);
    expect(validateOwnershipMessage(message.replace('TRADING_OWNERSHIP', 'SIGN_IN'), expected)).toBe(false);
  });
});