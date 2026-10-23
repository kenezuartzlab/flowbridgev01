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
describe('revocable private application access', () => {
  it('catalogue creates no signed URL and offers only gated download identifiers', async () => {
    const r = await handler(materials, 'GET')({ request: new Request('http://localhost/api/admin/application-materials') });
    const body = await r.json(); expect(body.expiresInSeconds).toBe(0); expect(body.files).toHaveLength(5);
    expect(body.files.every((f: Record<string, unknown>) => !('url' in f) && !('path' in f))).toBe(true);
    expect(mocks.signed).not.toHaveBeenCalled(); expect(r.headers.get('cache-control')).toBe('private, no-store');
  });
  it('rechecks authorization for each download and blocks a previously authorized operator after revocation', async () => {
    mocks.download.mockResolvedValue({ data: new Blob(['private content'], { type: 'application/pdf' }), error: null });
    const request = new Request('http://localhost/api/admin/application-files?id=dossier-pdf');
    const first = await handler(files, 'GET')({ request }); expect(first.status).toBe(200); expect(await first.text()).toBe('private content');
    mocks.gate.mockResolvedValue({ ok: false, response: new Response('Forbidden', { status: 403 }) });
    const second = await handler(files, 'GET')({ request }); expect(second.status).toBe(403); expect(mocks.download).toHaveBeenCalledTimes(1);
  });
  it('unauthorized users cannot list or download private files', async () => {
    mocks.gate.mockImplementation(async () => ({ ok: false, response: new Response('Unauthorized', { status: 401 }) }));
    expect((await handler(materials, 'GET')({ request: new Request('http://localhost/api/admin/application-materials') })).status).toBe(401);
    expect((await handler(files, 'GET')({ request: new Request('http://localhost/api/admin/application-files?id=dossier-pdf') })).status).toBe(401);
    expect(mocks.download).not.toHaveBeenCalled();
  });
});