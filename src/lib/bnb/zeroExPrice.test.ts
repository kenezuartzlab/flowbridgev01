import { describe, it, expect } from 'vitest';
import { buildZeroExPriceUrl, parseZeroExPrice, validateZeroExRequest, ZeroExGuard, ZEROX_DIRECTIONS, type ZeroExRequest } from './zeroExPrice';
import { fetchZeroExPrice } from './zeroExPrice.server';
import { BNB_ASSETS } from './quoteAdapter';

const req: ZeroExRequest = { direction: 'WBNB->USDT', sellAmount: '10000000000000000' };
const W = BNB_ASSETS.WBNB.address, U = BNB_ASSETS.USDT.address;
const good = () => ({
  blockNumber: '134120000', buyAmount: '5900000000000000000', buyToken: U, sellToken: W, sellAmount: req.sellAmount,
  minBuyAmount: '5870000000000000000', gas: '190000', gasPrice: '50000000', totalNetworkFee: String(190000n * 50000000n),
  liquidityAvailable: true, fees: { integratorFee: null, zeroExFee: { amount: '8850000000000000', token: U, type: 'volume' }, gasFee: null },
  issues: { allowance: { actual: '0', spender: '0x0000000000001ff3684f28c67538d4d072c22734' }, balance: null, simulationIncomplete: false },
  route: { fills: [{ source: 'PancakeSwap_V3', from: W, to: U, proportionBps: '10000' }] },
  transaction: { to: '0xdead', data: '0xabcdef' }, permit2: { eip712: {} }, zid: '0x123',
});
const ctx = { now: 1000, observedAt: 1000, latencyMs: 5 };
const LEAK = /0x[\da-f]{6,}|spender|calldata|"data"|taker|signature|permit|allowanceTarget|transaction/i;
const ok = (b: unknown, status = 200, ct = 'application/json') => async () => new Response(JSON.stringify(b), { status, headers: { 'content-type': ct } });

describe('V1.8 0x request gate', () => {
  it('builds only the fixed origin/path with 4 params, no taker', () => {
    const u = new URL(buildZeroExPriceUrl(req));
    expect(u.origin + u.pathname).toBe('https://api.0x.org/swap/allowance-holder/price');
    expect([...u.searchParams.keys()].sort()).toEqual(['buyToken', 'chainId', 'sellAmount', 'sellToken']);
    expect(u.searchParams.get('chainId')).toBe('56');
  });
  it.each([
    [{ direction: 'XAUt->USDT', sellAmount: '1' }, 'pair-not-allowed'],
    [{ direction: 'USDT->XAUt', sellAmount: '1' }, 'pair-not-allowed'],
    [{ direction: 'WBNB->USDT', sellAmount: '1', chainId: 1 }, 'unexpected-fields'],
    [{ direction: 'WBNB->USDT', sellAmount: '1', url: 'https://evil' }, 'unexpected-fields'],
    [{ direction: 'WBNB->USDT', sellAmount: '1', taker: '0x1' }, 'unexpected-fields'],
    [{ direction: 'WBNB->USDT', sellAmount: '1.5' }, 'amount-not-integer'],
    [{ direction: 'WBNB->USDT', sellAmount: '0' }, 'amount-out-of-cap'],
    [{ direction: 'WBNB->USDT', sellAmount: (10n ** 30n).toString() }, 'amount-out-of-cap'],
    [{ direction: 'WBNB->USDT', sellAmount: 1 }, 'amount-not-integer'],
    [null, 'body'],
  ])('denies %j', (input, reason) => expect(validateZeroExRequest(input)).toEqual({ ok: false, reason }));
  it('accepts both fixed directions', () => { for (const d of Object.keys(ZEROX_DIRECTIONS)) expect(validateZeroExRequest({ direction: d, sellAmount: '1000' }).ok).toBe(true); });
});

describe('V1.8 0x response validation', () => {
  it('projects a valid body to a non-executable DTO with no leaked fields', () => {
    const r = parseZeroExPrice(req, good(), ctx);
    expect(r.status).toBe('INDICATIVE_UNEXECUTABLE'); expect(r.executable).toBe(false);
    expect(r.buyAmount).toBe('5900000000000000000'); expect(r.fees?.zeroExFee).toBe('8850000000000000');
    expect(r.totalNetworkFeeWei).toBe('9500000000000'); expect(r.sources).toEqual(['PancakeSwap_V3']);
    expect(JSON.stringify(r)).not.toMatch(LEAK);
  });
  const mut = (f: (b: ReturnType<typeof good>) => void) => { const b = good(); f(b); return parseZeroExPrice(req, b, ctx); };
  it.each<[string, (b: any) => void, string]>([
    ['wrong chain', (b) => { b.chainId = 1; }, 'chain'],
    ['wrong buy token', (b) => { b.buyToken = BNB_ASSETS.XAUt.address; }, 'token-mismatch'],
    ['swapped sell token', (b) => { b.sellToken = U; }, 'token-mismatch'],
    ['sell amount differs', (b) => { b.sellAmount = '1'; }, 'sellAmount'],
    ['zero buy', (b) => { b.buyAmount = '0'; }, 'buyAmount'],
    ['decimal buy', (b) => { b.buyAmount = '1.5'; }, 'buyAmount'],
    ['negative buy', (b) => { b.buyAmount = '-1'; }, 'buyAmount'],
    ['uint256 overflow', (b) => { b.buyAmount = (2n ** 256n).toString(); }, 'buyAmount'],
    ['number not string', (b) => { b.buyAmount = 5.9e18; }, 'buyAmount'],
    ['min > buy', (b) => { b.minBuyAmount = '6000000000000000000'; }, 'minBuyAmount'],
    ['missing gas', (b) => { delete b.gas; }, 'gas'],
    ['absurd gas', (b) => { b.gas = '99999999'; }, 'gas'],
    ['gas double count', (b) => { b.totalNetworkFee = String(2n * 190000n * 50000000n); }, 'gas-double-count'],
    ['bad fee shape', (b) => { b.fees.zeroExFee = { amount: 'x', token: U }; }, 'fee-shape'],
    ['fee in foreign token', (b) => { b.fees.zeroExFee = { amount: '1', token: BNB_ASSETS.XAUt.address }; }, 'fee-shape'],
    ['fee exceeds output', (b) => { b.fees.zeroExFee = { amount: b.buyAmount, token: U }; }, 'fee-exceeds-output'],
    ['integrator fee not configured', (b) => { b.fees.integratorFee = { amount: '5', token: U }; }, 'unexpected-integrator-fee'],
    ['missing block', (b) => { delete b.blockNumber; }, 'blockNumber'],
    ['missing liquidity flag', (b) => { delete b.liquidityAvailable; }, 'liquidityAvailable'],
  ])('fails closed: %s', (_n, f, reason) => { const r = mut(f); expect(r.status).toBe('MALFORMED'); expect(r.reason).toBe(reason); expect(r.buyAmount).toBeUndefined(); });
  it('no liquidity', () => expect(mut((b: any) => { b.liquidityAvailable = false; }).status).toBe('NO_LIQUIDITY'));
  it('stale by age', () => expect(parseZeroExPrice(req, good(), { ...ctx, now: 40_000 }).status).toBe('STALE'));
  it('stale by block lag', () => expect(parseZeroExPrice(req, good(), { ...ctx, latestBlock: 134120100 }).status).toBe('STALE'));
  it('non-object', () => expect(parseZeroExPrice(req, '[]', ctx).status).toBe('MALFORMED'));
});

describe('V1.8 0x server transport', () => {
  const g = () => new ZeroExGuard();
  it('KEY_MISSING without secret and never fetches', async () => {
    let called = false; const prev = process.env['ZEROX_API_KEY']; delete process.env['ZEROX_API_KEY'];
    const r = await fetchZeroExPrice(req, { caller: 'a', guard: g(), fetchImpl: async () => { called = true; return new Response(); } });
    if (prev !== undefined) process.env['ZEROX_API_KEY'] = prev;
    expect(r.status).toBe('KEY_MISSING'); expect(called).toBe(false);
  });
  it('sends key only as header to fixed URL, never in result', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const r = await fetchZeroExPrice(req, { caller: 'a', apiKey: 'SECRETKEY123', guard: g(), now: () => 1000, fetchImpl: async (url, init) => { seen = { url, init }; return ok(good())(); } });
    expect(seen!.url.startsWith('https://api.0x.org/swap/allowance-holder/price?')).toBe(true);
    expect(seen!.url).not.toContain('SECRETKEY123');
    expect((seen!.init.headers as Record<string, string>)['0x-version']).toBe('v2');
    expect(seen!.init.redirect).toBe('manual');
    expect(JSON.stringify(r)).not.toContain('SECRETKEY123'); expect(r.status).toBe('INDICATIVE_UNEXECUTABLE');
  });
  it.each([[401, 'UNAUTHORIZED'], [403, 'FORBIDDEN'], [429, 'RATE_LIMITED'], [500, 'PROVIDER_ERROR'], [503, 'PROVIDER_ERROR'], [302, 'PROVIDER_ERROR']])('HTTP %i -> %s', async (code, st) => {
    const r = await fetchZeroExPrice(req, { caller: 'a', apiKey: 'k', guard: g(), fetchImpl: ok({ reason: 'leak 0xabcdef123456' }, code) });
    expect(r.status).toBe(st); expect(JSON.stringify(r)).not.toMatch(/abcdef/);
  });
  it('timeout', async () => {
    const r = await fetchZeroExPrice(req, { caller: 'a', apiKey: 'k', guard: g(), fetchImpl: async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; } });
    expect(r.status).toBe('TIMEOUT');
  });
  it('connection reset', async () => expect((await fetchZeroExPrice(req, { caller: 'a', apiKey: 'k', guard: g(), fetchImpl: async () => { throw new Error('ECONNRESET'); } })).status).toBe('NETWORK_ERROR'));
  it('non-JSON / bad JSON', async () => {
    expect((await fetchZeroExPrice(req, { caller: 'a', apiKey: 'k', guard: g(), fetchImpl: ok('x', 200, 'text/html') })).status).toBe('MALFORMED');
    expect((await fetchZeroExPrice(req, { caller: 'a', apiKey: 'k', guard: g(), fetchImpl: async () => new Response('{bad', { headers: { 'content-type': 'application/json' } }) })).status).toBe('MALFORMED');
  });
  it('caches valid results within TTL, invalidates, and never caches failures', async () => {
    const guard = g(); let n = 0; let t = 1000; const f = async () => { n++; return ok(good())(); };
    await fetchZeroExPrice(req, { caller: 'a', apiKey: 'k', guard, now: () => t, fetchImpl: f });
    await fetchZeroExPrice(req, { caller: 'a', apiKey: 'k', guard, now: () => t, fetchImpl: f }); expect(n).toBe(1);
    guard.invalidate(); await fetchZeroExPrice(req, { caller: 'a', apiKey: 'k', guard, now: () => t, fetchImpl: f }); expect(n).toBe(2);
    t += 20_000; await fetchZeroExPrice(req, { caller: 'a', apiKey: 'k', guard, now: () => t, fetchImpl: f }); expect(n).toBe(3);
    const g2 = g(); let m = 0; const bad = async () => { m++; return ok({}, 500)(); };
    await fetchZeroExPrice(req, { caller: 'a', apiKey: 'k', guard: g2, fetchImpl: bad }); await fetchZeroExPrice(req, { caller: 'a', apiKey: 'k', guard: g2, fetchImpl: bad }); expect(m).toBe(2);
  });
  it('per-caller, global and in-flight limits', () => {
    const guard = new ZeroExGuard(2, 3, 1);
    expect(guard.allow('a', 0)).toBe(true); expect(guard.allow('a', 1)).toBe(true); expect(guard.allow('a', 2)).toBe(false);
    expect(guard.allow('b', 3)).toBe(true); expect(guard.allow('c', 4)).toBe(false);
    expect(guard.allow('a', 70_000)).toBe(true);
    guard.inFlight = 1; expect(guard.allow('z', 70_001)).toBe(false);
  });
});
