import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildVoterRewardReadMessage } from '@/lib/ecosystem/voterRewardAccess';

const mocks = vi.hoisted(() => ({ verify: vi.fn(), summary: vi.fn(), sync: vi.fn(), ranked: vi.fn(), config: vi.fn() }));
vi.mock('@/lib/walletChallenge.server', () => ({ verifyWalletChallenge: mocks.verify }));
vi.mock('@/lib/ecosystem/voterRewards.server', () => ({ walletSummary: mocks.summary, syncVotes: mocks.sync, rankedVoters: mocks.ranked }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.config }) }) }) } }));
vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => (options: unknown) => options }));
import { readPrivateVoterRewards } from '@/routes/api/public/voter-rewards-summary';
import { Route as PublicRoute } from '@/routes/api/public/voter-rewards';

const wallet = '0x2222222222222222222222222222222222222222';
function payload() {
  const nonce = 'a'.repeat(48);
  return { walletAddress: wallet, nonce, chainId: 677, signature: `0x${'1'.repeat(130)}`, message: buildVoterRewardReadMessage({ address: wallet, nonce, chainId: 677, domain: 'flowbridge.space', uri: 'https://flowbridge.space', issuedAt: new Date().toISOString() }) };
}
const request = (body: unknown, origin = 'https://flowbridge.space') => new Request('https://flowbridge.space/api/public/voter-rewards-summary', { method: 'POST', headers: { 'Content-Type': 'application/json', origin }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.resetAllMocks(); mocks.summary.mockResolvedValue({ availableFlow: 10, claims: [] });
  mocks.sync.mockResolvedValue({ halted: false }); mocks.ranked.mockResolvedValue([{ wallet, votes: 5 }]);
  mocks.config.mockResolvedValue({ data: { enabled: true, min_claim_flow: 1 } });
});
describe('public voter rewards response', () => {
  it('arbitrary wallet queries expose only public voting facts', async () => {
    const route = PublicRoute as unknown as { server: { handlers: { GET: (args: { request: Request }) => Promise<Response> } } };
    const response = await route.server.handlers.GET({ request: new Request(`https://flowbridge.space/api/public/voter-rewards?wallet=${wallet}`) });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.mine).toEqual({ rank: 1, votes: 5 });
    expect(JSON.stringify(data)).not.toMatch(/earnedFlow|paidFlow|availableFlow|tx_hash|created_at|pending|claims\"/);
    expect(mocks.summary).not.toHaveBeenCalled();
  });
});
describe('private voter rewards handler', () => {
  it('denies unsigned requests before any private read', async () => {
    expect((await readPrivateVoterRewards(request({ walletAddress: wallet }))).status).toBe(400);
    expect(mocks.verify).not.toHaveBeenCalled(); expect(mocks.summary).not.toHaveBeenCalled();
  });
  it('rejects forged origins before challenge consumption', async () => {
    expect((await readPrivateVoterRewards(request(payload(), 'https://attacker.example'))).status).toBe(400);
    expect(mocks.verify).not.toHaveBeenCalled(); expect(mocks.summary).not.toHaveBeenCalled();
  });
  it.each(['forged', 'expired', 'replayed'])('denies %s signatures without reading rewards', async () => {
    mocks.verify.mockResolvedValue({ ok: false, status: 401 });
    expect((await readPrivateVoterRewards(request(payload()))).status).toBe(401);
    expect(mocks.summary).not.toHaveBeenCalled();
  });
  it('reads only the wallet returned by successful single-use verification', async () => {
    mocks.verify.mockResolvedValue({ ok: true, wallet });
    const response = await readPrivateVoterRewards(request(payload()));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.summary).toHaveBeenCalledExactlyOnceWith(wallet);
    expect(await response.json()).toEqual({ summary: { availableFlow: 10, claims: [] } });
  });
  it('rejects arbitrary extra wallet selectors', async () => {
    expect((await readPrivateVoterRewards(request({ ...payload(), wallet: 'another' }))).status).toBe(400);
    expect(mocks.summary).not.toHaveBeenCalled();
  });
});