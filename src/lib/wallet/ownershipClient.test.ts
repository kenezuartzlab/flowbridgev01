import { beforeEach, describe, expect, it, vi } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { verifyMessage } from 'viem';
import { validateOwnershipMessage } from './ownershipMessage';
const m = vi.hoisted(() => ({ request: vi.fn(), tokenPocket: false }));
vi.mock('./activeProvider', () => ({ getActiveProvider: async () => ({ request: m.request }) }));
vi.mock('@/lib/in-app-browser', () => ({ isTokenPocketBrowser: () => m.tokenPocket, isInAppBrowser: () => m.tokenPocket }));
import { clearWalletVerified, ensureWalletVerified } from '@/lib/walletVerification';
const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const wallet = account.address.toLowerCase();
const storage = new Map<string, string>();
let submissions = 0;
let chain = '0x2a5';
beforeEach(() => {
  storage.clear(); submissions = 0; chain = '0x2a5'; m.tokenPocket = false;
  vi.stubGlobal('window', { location: { host: 'flowbridge.space', origin: 'https://flowbridge.space' }, sessionStorage: {
    getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key),
  }, localStorage: { removeItem: vi.fn() } });
  m.request.mockReset().mockImplementation(async ({ method, params }) => {
    if (method === 'eth_accounts') return [wallet];
    if (method === 'eth_chainId') return chain;
    if (method === 'personal_sign') {
      const message = params[0].startsWith('0x') ? new TextDecoder().decode(Uint8Array.from(params[0].slice(2).match(/../g), (v: string) => parseInt(v, 16))) : params[0];
      return account.signMessage({ message });
    }
    throw new Error('No transaction or other request allowed');
  });
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    if (url === '/api/public/siwe/nonce') return Response.json({ nonce: 'a'.repeat(48) });
    expect(url).toBe('/api/public/wallet-proof'); submissions++;
    const body = JSON.parse(init.body);
    expect(validateOwnershipMessage(body.message, { wallet, nonce: body.nonce, chainId: 677, requestOrigin: 'https://flowbridge.space', nowMs: Date.now() })).toBe(true);
    expect(await verifyMessage({ address: account.address, message: body.message, signature: body.signature })).toBe(true);
    return Response.json({ verified: true });
  }));
});
describe('fresh wallet-only swap and bridge proof transport (simulated providers)', () => {
  it.each(['TokenPocket', 'MetaMask', 'Rabby', 'EIP-1193'])('supports %s without account registration or transactions', async provider => {
    m.tokenPocket = provider === 'TokenPocket';
    const sign = async ({ message }: { message: string }) => account.signMessage({ message });
    await Promise.all([ensureWalletVerified(wallet, sign, 677), ensureWalletVerified(wallet, sign, 677)]);
    expect(submissions).toBe(1);
    await ensureWalletVerified(wallet, sign, 677); expect(submissions).toBe(1);
    storage.clear(); // Fresh tab/reconnection has no inherited sign-in proof.
    await ensureWalletVerified(wallet, sign, 677); expect(submissions).toBe(2);
  });
  it('rejection aborts before verification and a retry can succeed', async () => {
    await expect(ensureWalletVerified(wallet, async () => { throw new Error('User rejected request'); }, 677)).rejects.toThrow('rejected');
    expect(submissions).toBe(0);
    await ensureWalletVerified(wallet, async ({ message }) => account.signMessage({ message }), 677);
    expect(submissions).toBe(1);
  });
  it('wrong-chain is rejected before a signature', async () => {
    chain = '0x38'; const sign = vi.fn();
    await expect(ensureWalletVerified(wallet, sign, 677)).rejects.toThrow('network'); expect(sign).not.toHaveBeenCalled();
  });
});