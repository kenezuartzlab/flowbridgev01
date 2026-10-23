import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSignInMessage } from './signInMessage';
const m = vi.hoisted(() => ({ consume: vi.fn(), verify: vi.fn(), generate: vi.fn(), limit: vi.fn(), profile: vi.fn() }));
vi.mock('viem', () => ({ verifyMessage: m.verify, verifyTypedData: m.verify }));
vi.mock('./requestLimit.server', () => ({ checkWalletRequestLimit: m.limit }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { from: (table: string) => {
  let update = false;
  const q = { select: () => q, eq: () => q, is: () => q, gt: () => q, update: () => { update = true; return q; }, maybeSingle: async () => table === 'profiles' ? m.profile() : update ? m.consume() : { data: { id: 'nonce-row', wallet_address: '0x'+'1'.repeat(40), expires_at: new Date(Date.now()+60000).toISOString(), used_at: null } } };
  return q;
}, auth: { admin: { generateLink: m.generate } } } }));
import { Route } from '@/routes/api/public/siwe.verify';
const wallet = '0x'+'1'.repeat(40), nonce = 'a'.repeat(48);
function call(extra = {}) {
  const message = buildSignInMessage({ address: wallet, nonce, domain: 'flowbridge.space', uri: 'https://flowbridge.space', chainId: 677, issuedAt: new Date().toISOString() });
  const handler = (Route.options as unknown as { server: { handlers: { POST: (p: {request:Request}) => Promise<Response> } } }).server.handlers.POST;
  return handler({ request: new Request('https://flowbridge.space/api/public/siwe/verify', { method:'POST', headers: { origin: 'https://flowbridge.space' }, body: JSON.stringify({ walletAddress: wallet, nonce, message, signature: '0x'+'1'.repeat(130), ...extra }) }) });
}
beforeEach(() => { vi.resetAllMocks(); m.verify.mockResolvedValue(true); m.limit.mockResolvedValue(null); m.consume.mockResolvedValue({data:{id:'nonce-row'}}); m.profile.mockResolvedValue({data:{email:'test@example.invalid'}}); m.generate.mockResolvedValue({data:{properties:{hashed_token:'test-only-token',verification_type:'magiclink'}}}); });
describe('wallet proof single-use and privacy', () => {
  it('two concurrent valid proofs yield one session, never two', async () => {
    let used = false;
    m.consume.mockImplementation(async () => { if (used) return {data:null}; used=true; return {data:{id:'nonce-row'}}; });
    const responses = await Promise.all([call(),call()]); expect(responses.filter(r=>r.status===200)).toHaveLength(1); expect(responses.filter(r=>r.status>=400)).toHaveLength(1); expect(m.generate).toHaveBeenCalledTimes(1);
  });
  it('failed nonce consumption never issues a session or reads a profile', async () => {
    m.consume.mockResolvedValue({error:{message:'unavailable'}}); expect((await call()).status).toBe(409); expect(m.generate).not.toHaveBeenCalled(); expect(m.profile).not.toHaveBeenCalled();
  });
  it('valid wallet proof returns no account email', async () => {
    const body = await (await call()).json(); expect(body.verified).toBe(true); expect(body).not.toHaveProperty('email'); expect(body).not.toHaveProperty('emailHint');
  });
  it('unbound wallet proof keeps the explicit bind path without an identity or session', async () => {
    m.profile.mockResolvedValue({data:null}); expect(await (await call()).json()).toEqual({verified:true,needs_binding:true}); expect(m.generate).not.toHaveBeenCalled();
  });
  it('invalid site message and invalid signatures never consume a nonce', async () => {
    expect((await call({message:'fake '+nonce})).status).toBe(400); expect(m.consume).not.toHaveBeenCalled();
    m.verify.mockResolvedValue(false); expect((await call()).status).toBe(401); expect(m.consume).not.toHaveBeenCalled();
  });
});