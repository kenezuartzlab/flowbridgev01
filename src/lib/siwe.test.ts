import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ otp: vi.fn(), setSession: vi.fn(), fetch: vi.fn(), sign: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { verifyOtp: m.otp, setSession: m.setSession } } }));
vi.mock('@/lib/in-app-browser', () => ({ isTokenPocketBrowser: () => true }));
import { signInWithEthereum } from './siwe';
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('window', { location: { host: 'flowbridge.space', origin: 'https://flowbridge.space' } });
  vi.stubGlobal('fetch', m.fetch);
  m.fetch.mockResolvedValueOnce(Response.json({ nonce: 'a'.repeat(48) })).mockResolvedValueOnce(Response.json({ token_hash: 'test-only-token', verify_type: 'magiclink' }));
  m.sign.mockResolvedValue('0x' + '1'.repeat(130));
  m.otp.mockResolvedValue({ data: { user: { email: 'test@example.invalid' }, session: { access_token: 'test-access', refresh_token: 'test-refresh' } }, error: null });
});
const run = () => signInWithEthereum({ address: '0x' + 'a'.repeat(40), chainId: 677, signMessage: m.sign });
describe('wallet session completion', () => {
  it('exchanges the single-use token once without a redundant setSession', async () => {
    expect((await run()).status).toBe('signed_in');
    expect(m.otp).toHaveBeenCalledTimes(1);
    expect(m.setSession).not.toHaveBeenCalled();
  });
  it('does not report success without a complete persisted session', async () => {
    m.otp.mockResolvedValue({ data: { user: {}, session: null }, error: null });
    await expect(run()).rejects.toThrow('session was not created');
  });
  it('expired tokens remain errors and are never reused', async () => {
    m.otp.mockResolvedValue({ data: {}, error: new Error('Token expired') });
    await expect(run()).rejects.toThrow('Token expired');
    expect(m.otp).toHaveBeenCalledTimes(1);
    expect(m.setSession).not.toHaveBeenCalled();
  });
});