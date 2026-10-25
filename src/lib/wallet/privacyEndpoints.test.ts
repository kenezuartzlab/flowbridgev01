import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ gate: vi.fn(), from: vi.fn(), download: vi.fn(), signed: vi.fn() }));
vi.mock('@/lib/admin/adminGate.server', () => ({ requireAdmin: mocks.gate }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { from: mocks.from, storage: { from: () => ({ download: mocks.download, createSignedUrl: mocks.signed }) } } }));
import { Route as lookup } from '@/routes/api/public/wallet-lookup';
import { Route as materials } from '@/routes/api/admin.application-materials';
import { Route as files } from '@/routes/api/admin.application-files';
type Handler = (args: { request: Request }) => Promise<Response>;
function handler(route: { options: unknown }, method: string) { return (route.options as { server: { handlers: Record<string, Handler> } }).server.handlers[method]; }
beforeEach(() => { vi.resetAllMocks(); mocks.gate.mockResolvedValue({ ok: true, admin: {} }); });
describe('private wallet account lookup', () => {
  it('returns identical responses without any profile read for arbitrary input', async () => {
    const responses = [];
    for (const body of [{ walletAddress: '0x' + '1'.repeat(40) }, { walletAddress: '0x' + '2'.repeat(40) }, {}, { walletAddress: 'invalid' }]) {
      const r = await handler(lookup, 'POST')({ request: new Request('http://localhost/api/public/wallet-lookup', { method: 'POST', body: JSON.stringify(body) }) });
      expect(r.status).toBe(200); responses.push(await r.json());
    }
    expect(responses).toEqual(Array(4).fill({ verificationRequired: true })); expect(mocks.from).not.toHaveBeenCalled();
  });
});
describe('permanently retired private-file sharing', () => {
  for (const [name, route] of [['catalogue', materials], ['download', files]] as const) {
    for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      it(`${name} denies direct ${method} without storage or link generation`, async () => {
        const response = await handler(route, method)({ request: new Request('http://localhost/api/admin/application-files?id=dossier-pdf', { method }) });
        expect(response.status).toBe(410);
        const body = await response.json();
        expect(body.files).toBeUndefined(); expect(body.url).toBeUndefined();
        expect(mocks.download).not.toHaveBeenCalled(); expect(mocks.signed).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled();
      });
    }
  }
  it('denies a signed-out caller just as an authorized caller', async () => {
    mocks.gate.mockResolvedValue({ ok: false, response: new Response('Unauthorized', { status: 401 }) });
    expect((await handler(files, 'GET')({ request: new Request('http://localhost/api/admin/application-files') })).status).toBe(410);
    expect(mocks.download).not.toHaveBeenCalled(); expect(mocks.gate).not.toHaveBeenCalled();
  });
});