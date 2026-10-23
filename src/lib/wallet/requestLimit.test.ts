import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { rpc: mocks.rpc } }));
import { checkWalletRequestLimit } from './requestLimit.server';
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
describe('owner-approved custom wallet request limits', () => {
  it('fails closed when unconfigured or the shared limit cannot be checked', async () => {
    vi.stubEnv('WALLET_REQUEST_LIMIT_SECRET', ''); expect((await checkWalletRequestLimit('test'))?.status).toBe(503);
    vi.stubEnv('WALLET_REQUEST_LIMIT_SECRET', 'test-only-key'); mocks.rpc.mockResolvedValue({ error: {} }); expect((await checkWalletRequestLimit('test'))?.status).toBe(503);
  });
  it('allows a permitted request and returns a recoverable 429 when rejected', async () => {
    vi.stubEnv('WALLET_REQUEST_LIMIT_SECRET', 'test-only-key'); mocks.rpc.mockResolvedValue({ data: true }); expect(await checkWalletRequestLimit('test')).toBeNull();
    mocks.rpc.mockResolvedValue({ data: false }); const denied = await checkWalletRequestLimit('test'); expect(denied?.status).toBe(429); expect(denied?.headers.get('Retry-After')).toBe('60');
  });
});