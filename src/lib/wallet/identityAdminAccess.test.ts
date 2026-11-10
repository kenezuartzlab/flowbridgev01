import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ gate: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/admin/adminGate.server', () => ({ requireAdmin: m.gate }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { rpc: m.rpc } }));
import { Route as Identity } from '@/routes/api/admin.identity';
import { Route as Revisions } from '@/routes/api/admin.promotion-revisions';
type Handlers = Record<string, (args: { request: Request }) => Promise<Response>>;
beforeEach(() => vi.resetAllMocks());
it('operators cannot read identity evidence, grant/revoke recovery, or read/restore revisions', async () => {
  m.gate.mockResolvedValue({ ok: true, admin: { role: 'internal_operator' } });
  for (const route of [Identity, Revisions]) {
    const handlers = (route.options as unknown as { server: { handlers: Handlers } }).server.handlers;
    for (const [method, handler] of Object.entries(handlers)) {
      expect((await handler({ request: new Request('https://flowbridge.space/api/admin/check', { method }) })).status).toBe(403);
    }
  }
  expect(m.rpc).not.toHaveBeenCalled();
});
it('a super admin cannot authorize a past expiry, more than 24 hours, or missing ownership evidence', async () => {
  m.gate.mockResolvedValue({ ok: true, admin: { role: 'super_admin', userId: 'actor', wallet: 'wallet' } });
  const handler = (Identity.options as unknown as { server: { handlers: Handlers } }).server.handlers.POST;
  const input = { userId: '12345678-1234-4234-8234-123456789001', targetWallet: `0x${'a'.repeat(40)}`, reason: 'Verified recovery reason', ownershipEvidence: 'Verified account evidence', expiresAt: new Date(Date.now()+3600000).toISOString() };
  for (const change of [{ expiresAt: new Date(Date.now()-1000).toISOString() }, { expiresAt: new Date(Date.now()+25*3600000).toISOString() }, { ownershipEvidence: '' }]) {
    expect((await handler({ request: new Request('https://flowbridge.space/api/admin/identity', { method: 'POST', body: JSON.stringify({ ...input, ...change }) }) })).status).toBe(400);
  }
  expect(m.rpc).not.toHaveBeenCalled();
});