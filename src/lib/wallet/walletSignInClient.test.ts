import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hexToString } from 'viem';
const m = vi.hoisted(() => ({ provider: vi.fn(), signIn: vi.fn(), request: vi.fn(), otp: vi.fn(), setSession: vi.fn() }));
vi.mock('./activeProvider', () => ({ getActiveProvider: m.provider }));
vi.mock('@/lib/siwe', () => ({ signInWithEthereum: m.signIn }));
import { signInWithLinkedWallet, detectLinkedWallet } from '@/lib/walletLink';
const address = '0x' + 'a'.repeat(40);
beforeEach(() => {
  vi.resetAllMocks();
  m.provider.mockResolvedValue({ request: m.request });
  m.request.mockImplementation(async ({ method }) => method === 'eth_chainId' ? '0x2a5' : method === 'eth_accounts' ? [address] : 'signature');
  m.signIn.mockImplementation(async (args) => ({ status: 'signed_in', signature: await args.signMessage('FlowBridge sign-in\nFree signature.') }));
});
describe('wallet sign-in transport', () => {
  it('uses the selected provider and signs exact UTF-8 hex bytes on chain 677', async () => {
    await signInWithLinkedWallet(address.toUpperCase().replace('0X', '0x'));
    const call = m.request.mock.calls.find(([a]) => a.method === 'personal_sign')?.[0];
    expect(call.params[1]).toBe(address);
    expect(hexToString(call.params[0])).toBe('FlowBridge sign-in\nFree signature.');
    expect(m.signIn.mock.calls[0][0].chainId).toBe(677);
  });
  it('account change stops before signing or issuing a session', async () => {
    m.request.mockImplementation(async ({ method }) => method === 'eth_chainId' ? '0x2a5' : ['0x' + 'b'.repeat(40)]);
    await expect(signInWithLinkedWallet(address)).rejects.toThrow('account changed');
    expect(m.request.mock.calls.some(([a]) => a.method === 'personal_sign')).toBe(false);
  });
  it('wallet rejection does not retry a signature', async () => {
    m.request.mockImplementation(async ({ method }) => {
      if (method === 'personal_sign') throw new Error('User rejected');
      return method === 'eth_chainId' ? '0x2a5' : [address];
    });
    await expect(signInWithLinkedWallet(address)).rejects.toThrow('User rejected');
    expect(m.request.mock.calls.filter(([a]) => a.method === 'personal_sign')).toHaveLength(1);
  });
  it('detects the selected connected wallet without requesting a signature', async () => {
    expect(await detectLinkedWallet()).toEqual({ address });
    expect(m.request).toHaveBeenCalledWith({ method: 'eth_accounts' });
    expect(m.signIn).not.toHaveBeenCalled();
  });
});