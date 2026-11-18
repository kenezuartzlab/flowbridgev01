/**
 * V1.8 0x indicative PRICE adapter (pure, browser-safe, no transport). Read-only /price only — never /quote.
 * Fixed origin/path, chain 56, exact WBNB<->USDT only, capped sizes. Results are INDICATIVE and never executable;
 * calldata, spender, taker, addresses, signatures and secrets are stripped before anything leaves the server.
 */
import { BNB_ASSETS } from './quoteAdapter';

export const ZEROX_ORIGIN = 'https://api.0x.org';
export const ZEROX_PRICE_PATH = '/swap/allowance-holder/price';
export const ZEROX_CHAIN_ID = 56;
export const ZEROX_SIZES_USD = [5, 25, 100, 500, 1000] as const;
export const ZEROX_MAX_SELL_WEI = 10n ** 18n * 1_200n; // hard cap (> $1000 USDT or > 1000 USD of BNB at any sane rate)
export const ZEROX_TIMEOUT_MS = 4_000;
export const ZEROX_CACHE_TTL_MS = 15_000;
export const ZEROX_MAX_AGE_MS = 30_000;
export const ZEROX_MAX_BLOCK_LAG = 40; // ~ 30 s of BSC blocks at 0.75 s

export type ZeroExDirection = 'WBNB->USDT' | 'USDT->WBNB';
export const ZEROX_DIRECTIONS: Record<ZeroExDirection, { sell: string; buy: string }> = {
  'WBNB->USDT': { sell: BNB_ASSETS.WBNB.address, buy: BNB_ASSETS.USDT.address },
  'USDT->WBNB': { sell: BNB_ASSETS.USDT.address, buy: BNB_ASSETS.WBNB.address },
};

export type ZeroExStatus =
  | 'INDICATIVE_UNEXECUTABLE' | 'KEY_MISSING' | 'BLOCKED_REQUEST' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'RATE_LIMITED'
  | 'PROVIDER_ERROR' | 'TIMEOUT' | 'NETWORK_ERROR' | 'MALFORMED' | 'NO_LIQUIDITY' | 'STALE' | 'LOCAL_RATE_LIMITED';

export interface ZeroExPublicResult {
  provider: '0x'; status: ZeroExStatus; executable: false; direction?: ZeroExDirection;
  sellAmount?: string; buyAmount?: string; minBuyAmount?: string;
  fees?: { zeroExFee: string | null; integratorFee: string | null; gasFee: string | null; feeToken: 'buy' | 'sell' | null };
  feeSemantics?: 'UNVERIFIED'; simulationIncomplete?: boolean;
  gasUnits?: string; gasPriceWei?: string; totalNetworkFeeWei?: string; blockNumber?: number;
  sources?: string[]; observedAt?: string; latencyMs?: number; reason?: string;
}

export interface ZeroExRequest { direction: ZeroExDirection; sellAmount: string }
const INT = /^(0|[1-9]\d{0,77})$/;
const MAX_UINT = 2n ** 256n - 1n;

/** Validate caller input. Any extra key, other chain, token or size is denied. */
export function validateZeroExRequest(input: unknown): { ok: true; req: ZeroExRequest } | { ok: false; reason: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, reason: 'body' };
  const o = input as Record<string, unknown>;
  const keys = Object.keys(o).sort().join(',');
  if (keys !== 'direction,sellAmount') return { ok: false, reason: 'unexpected-fields' };
  if (typeof o.direction !== 'string' || !(o.direction in ZEROX_DIRECTIONS)) return { ok: false, reason: 'pair-not-allowed' };
  if (typeof o.sellAmount !== 'string' || !INT.test(o.sellAmount)) return { ok: false, reason: 'amount-not-integer' };
  const v = BigInt(o.sellAmount);
  if (v <= 0n || v > ZEROX_MAX_SELL_WEI) return { ok: false, reason: 'amount-out-of-cap' };
  return { ok: true, req: { direction: o.direction as ZeroExDirection, sellAmount: o.sellAmount } };
}

/** Fixed URL: only origin, path and the four allowed params. No taker, no fee recipient, no slippage. */
export function buildZeroExPriceUrl(req: ZeroExRequest): string {
  const d = ZEROX_DIRECTIONS[req.direction];
  const u = new URL(ZEROX_PRICE_PATH, ZEROX_ORIGIN);
  u.searchParams.set('chainId', String(ZEROX_CHAIN_ID));
  u.searchParams.set('sellToken', d.sell);
  u.searchParams.set('buyToken', d.buy);
  u.searchParams.set('sellAmount', req.sellAmount);
  return u.toString();
}

export function statusForHttp(code: number): ZeroExStatus | null {
  if (code === 200) return null;
  if (code === 401) return 'UNAUTHORIZED';
  if (code === 403) return 'FORBIDDEN';
  if (code === 429) return 'RATE_LIMITED';
  return 'PROVIDER_ERROR';
}

const fail = (status: ZeroExStatus, reason: string, direction?: ZeroExDirection): ZeroExPublicResult => ({ provider: '0x', status, executable: false, direction, reason });
const isAddr = (v: unknown) => typeof v === 'string' && /^0x[\da-f]{40}$/i.test(v);
const uint = (v: unknown, allowZero = false): bigint | null => {
  if (typeof v !== 'string' || !INT.test(v)) return null;
  const b = BigInt(v); if (b > MAX_UINT || (!allowZero && b === 0n)) return null; return b;
};
function feeAmount(f: unknown, buy: string, sell: string): { amount: string | null; token: 'buy' | 'sell' | null } | 'bad' {
  if (f === null || f === undefined) return { amount: null, token: null };
  if (typeof f !== 'object') return 'bad';
  const r = f as Record<string, unknown>;
  const a = uint(r.amount, true); if (a === null || !isAddr(r.token)) return 'bad';
  const t = String(r.token).toLowerCase();
  const token = t === buy ? 'buy' : t === sell ? 'sell' : null; if (!token) return 'bad';
  return { amount: a.toString(), token };
}

/**
 * Strictly validate a /price body against the exact request and project it onto a public, non-executable DTO.
 * Fees are reported, never deducted from buyAmount here (net semantics unverified).
 * Current schema: totalNetworkFee may be below gas limit * gasPrice; use it once when supplied.
 */
export function parseZeroExPrice(req: ZeroExRequest, body: unknown, ctx: { now: number; latestBlock?: number; observedAt: number; latencyMs: number }): ZeroExPublicResult {
  const dir = req.direction; const d = ZEROX_DIRECTIONS[dir];
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('MALFORMED', 'body', dir);
  const b = body as Record<string, unknown>;
  if (b.liquidityAvailable === false) return fail('NO_LIQUIDITY', 'liquidityAvailable=false', dir);
  if (b.liquidityAvailable !== true) return fail('MALFORMED', 'liquidityAvailable', dir);
  if ('chainId' in b && Number(b.chainId) !== ZEROX_CHAIN_ID) return fail('MALFORMED', 'chain', dir);
  const buyT = String(b.buyToken ?? '').toLowerCase(); const sellT = String(b.sellToken ?? '').toLowerCase();
  if (buyT !== d.buy.toLowerCase() || sellT !== d.sell.toLowerCase()) return fail('MALFORMED', 'token-mismatch', dir);
  const sell = uint(b.sellAmount); if (sell === null || sell.toString() !== req.sellAmount) return fail('MALFORMED', 'sellAmount', dir);
  const buy = uint(b.buyAmount); if (buy === null) return fail('MALFORMED', 'buyAmount', dir);
  const min = uint(b.minBuyAmount); if (min === null || min > buy) return fail('MALFORMED', 'minBuyAmount', dir);
  const gas = uint(b.gas); const gp = uint(b.gasPrice); if (gas === null || gp === null || gas > 10_000_000n) return fail('MALFORMED', 'gas', dir);
  const tnf = uint(b.totalNetworkFee, true);
  if (b.totalNetworkFee != null && tnf === null) return fail('MALFORMED', 'network-fee', dir);
  if (tnf !== null && (tnf === 0n || tnf > gas * gp)) return fail('MALFORMED', 'gas-double-count', dir);
  const blockNumber = typeof b.blockNumber === 'string' && /^\d{1,12}$/.test(b.blockNumber) ? Number(b.blockNumber) : NaN;
  if (!Number.isFinite(blockNumber)) return fail('MALFORMED', 'blockNumber', dir);
  if (!Number.isFinite(ctx.now) || !Number.isFinite(ctx.observedAt) || ctx.now < ctx.observedAt || ctx.latencyMs < 0 || ctx.now - ctx.observedAt > ZEROX_MAX_AGE_MS) return fail('STALE', 'age', dir);
  if (ctx.latestBlock !== undefined && blockNumber > ctx.latestBlock + 2) return fail('STALE', 'future-block', dir);
  if (ctx.latestBlock !== undefined && ctx.latestBlock - blockNumber > ZEROX_MAX_BLOCK_LAG) return fail('STALE', 'block-lag', dir);
  const fees = b.fees as Record<string, unknown>;
  if (!fees || typeof fees !== 'object' || Array.isArray(fees)) return fail('MALFORMED', 'fees', dir);
  if (Object.keys(fees).some(k=>!['zeroExFee','integratorFee','integratorFees','gasFee'].includes(k)) || (fees.integratorFees != null && (!Array.isArray(fees.integratorFees) || fees.integratorFees.length > 0))) return fail('MALFORMED','unexpected-fees',dir);
  const zx = feeAmount(fees.zeroExFee, buyT, sellT); const ig = feeAmount(fees.integratorFee, buyT, sellT); const gf = feeAmount(fees.gasFee, buyT, sellT);
  if (zx === 'bad' || ig === 'bad' || gf === 'bad') return fail('MALFORMED', 'fee-shape', dir);
  if (ig.amount !== null && ig.amount !== '0') return fail('MALFORMED', 'unexpected-integrator-fee', dir); // none configured
  for (const f of [zx, gf]) if (f.amount !== null && ((f.token === 'buy' && BigInt(f.amount) >= buy) || (f.token === 'sell' && BigInt(f.amount) >= sell))) return fail('MALFORMED', 'fee-exceeds-output', dir);
  const fills = ((b.route as Record<string, unknown> | undefined)?.fills ?? []) as unknown[];
  const sources = Array.isArray(fills) ? [...new Set(fills.map((f) => String((f as Record<string, unknown>)?.source ?? '')).filter((s) => /^[\w .-]{1,40}$/.test(s)))].slice(0, 10) : [];
  return {
    provider: '0x', status: 'INDICATIVE_UNEXECUTABLE', executable: false, direction: dir,
    sellAmount: sell.toString(), buyAmount: buy.toString(), minBuyAmount: min.toString(),
    fees: { zeroExFee: zx.amount, integratorFee: ig.amount, gasFee: gf.amount, feeToken: zx.token ?? gf.token },
    feeSemantics: 'UNVERIFIED', simulationIncomplete: (b.issues as Record<string,unknown> | undefined)?.simulationIncomplete !== false,
    gasUnits: gas.toString(), gasPriceWei: gp.toString(), totalNetworkFeeWei: (tnf ?? gas * gp).toString(), blockNumber, sources,
    observedAt: new Date(ctx.observedAt).toISOString(), latencyMs: ctx.latencyMs,
  };
}

/** Short-TTL cache + fixed-window limiter + in-flight cap. One instance per worker isolate (best effort, not global). */
export class ZeroExGuard {
  private cache = new Map<string, { at: number; v: ZeroExPublicResult }>();
  private hits = new Map<string, number[]>();
  inFlight = 0;
  constructor(readonly maxPerMinutePerCaller = 12, readonly maxPerMinuteGlobal = 30, readonly maxInFlight = 2) {}
  key(r: ZeroExRequest) { return `${r.direction}:${r.sellAmount}`; }
  cached(r: ZeroExRequest, now: number) { const c = this.cache.get(this.key(r)); const observed=Date.parse(c?.v.observedAt??''); if (c && now>=c.at && now-c.at<ZEROX_CACHE_TTL_MS && Number.isFinite(observed) && now>=observed && now-observed<=ZEROX_MAX_AGE_MS) return c.v; if (c) this.cache.delete(this.key(r)); return null; }
  store(r: ZeroExRequest, v: ZeroExPublicResult, now: number) { if (v.status === 'INDICATIVE_UNEXECUTABLE') { this.cache.set(this.key(r), { at: now, v }); const oldest=this.cache.keys().next().value; if (this.cache.size > 50 && oldest !== undefined) this.cache.delete(oldest); } }
  invalidate() { this.cache.clear(); }
  allow(caller: string, now: number): boolean {
    const take = (k: string, max: number) => { const w = (this.hits.get(k) ?? []).filter((t) => now - t < 60_000); if (w.length >= max) { this.hits.set(k, w); return false; } return true; };
    if (!take(`c:${caller}`, this.maxPerMinutePerCaller) || !take('g', this.maxPerMinuteGlobal) || this.inFlight >= this.maxInFlight) return false;
    for (const k of [`c:${caller}`, 'g']) this.hits.set(k, [...(this.hits.get(k) ?? []).filter((t) => now - t < 60_000), now]);
    return true;
  }
}
