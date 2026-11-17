import { POOL_GATE, OFFICIAL_RPC, quoteFresh } from '@/lib/rwa/quoteReadiness';

/** Observation registry only: deliberately never imported into executable token lists. */
export const BNB_ASSETS = {
  WBNB: { chainId: 56, address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', decimals: 18, rwa: false },
  USDT: { chainId: 56, address: POOL_GATE.usdt, decimals: 18, rwa: false },
  XAUt: { chainId: 56, address: POOL_GATE.xaut, decimals: 6, rwa: true },
} as const;
export type BnbAsset = keyof typeof BNB_ASSETS;
export const BNB_PROVIDERS = {
  'pancake-v3': { label: 'PancakeSwap V3', kind: 'AMM simulation', rpc: OFFICIAL_RPC, transport: 'local acceptance only' },
  '0x': { label: '0x', kind: 'Aggregation', rpc: [], transport: 'UNVERIFIED · API access / terms not configured' },
  'pancake-x': { label: 'PancakeSwapX', kind: 'RFQ', rpc: [], transport: 'UNVERIFIED · endpoint / access / terms not configured' },
} as const;
export type BnbProvider = keyof typeof BNB_PROVIDERS;
export type BnbPair = 'WBNB/USDT' | 'USDT/XAUt';
export const BNB_PAIRS = {
  'WBNB/USDT': ['WBNB', 'USDT'],
  'USDT/XAUt': ['USDT', 'XAUt'],
} as const;
/** Exact pools observed in the committed V1.2 local transcript; not trading allowlists. */
export const BNB_OBSERVED_POOLS = [
  { pair: 'WBNB/USDT', fee: 500, pool: '0x36696169C63e42cd08ce11f5deeBbCeBae652050' },
  { pair: 'WBNB/USDT', fee: 2500, pool: '0x1401ff943D08a7E098328C1d3a9d388923B115D2' },
  { pair: 'USDT/XAUt', fee: 500, pool: POOL_GATE.pool },
] as const;
export interface BnbQuoteRequest {
  chainId: number; provider: BnbProvider; pair: BnbPair; sell: BnbAsset; buy: BnbAsset;
  amountIn: string; contextId: number;
}
export interface BnbQuoteEvidence {
  request: BnbQuoteRequest; source: 'local-rpc'; archived: boolean;
  observedAt: string; blockTime: string; blockNumber: number; blockHash: string;
  pool: string; factory: string; fee: number; amountOut: string;
  chainConfirmed: boolean; identityConfirmed: boolean; decimalsConfirmed: boolean;
  codeConfirmed: boolean; peerMatched: boolean; canonical: boolean; activeLiquidity: boolean;
}
export type BnbQuoteState = 'UNVERIFIED' | 'BLOCKED' | 'STALE' | 'READ_ONLY_QUOTE';
export interface BnbQuoteResult {
  state: BnbQuoteState; reason: string; provider: BnbProvider; executionEnabled: false;
  amountOut?: string; blockNumber?: number; observedAt?: string;
  rwaGate: 'BLOCKED' | 'NOT_APPLICABLE';
}
const positiveInteger = (v: string) => /^[1-9]\d{0,30}$/.test(v);
export function requestFailure(r: BnbQuoteRequest): string | undefined {
  if (r.chainId !== 56 || !Number.isSafeInteger(r.contextId) || r.contextId < 0) return 'Invalid chain or context';
  if (!Object.hasOwn(BNB_PROVIDERS, r.provider) || !Object.hasOwn(BNB_PAIRS, r.pair)) return 'Unconfigured provider or pair';
  if (!Object.hasOwn(BNB_ASSETS, r.sell) || !Object.hasOwn(BNB_ASSETS, r.buy)) return 'Unlisted asset';
  const pair = BNB_PAIRS[r.pair];
  if (r.sell === r.buy || !pair.some(a => a === r.sell) || !pair.some(a => a === r.buy)) return 'Pair mismatch';
  if (!positiveInteger(r.amountIn)) return 'Invalid base-unit amount';
  const ceiling = r.sell === 'USDT' ? 1000n * 10n ** 18n : r.sell === 'WBNB' ? 1n * 10n ** 18n : 1n * 10n ** 6n;
  if (BigInt(r.amountIn) > ceiling) return 'Observation size exceeds read-only ceiling';
}
const sameRequest = (a: BnbQuoteRequest, b: BnbQuoteRequest) =>
  a.chainId === b.chainId && a.provider === b.provider && a.pair === b.pair && a.sell === b.sell && a.buy === b.buy && a.amountIn === b.amountIn && a.contextId === b.contextId;

/** All states forbid execution, including fresh read-only simulations. No request sends or signs. */
export function resolveBnbQuote(r: BnbQuoteRequest, activeContext: number, nowMs: number, e?: BnbQuoteEvidence): BnbQuoteResult {
  const base = { provider: r.provider, executionEnabled: false as const, rwaGate: r.pair === 'USDT/XAUt' ? 'BLOCKED' as const : 'NOT_APPLICABLE' as const };
  const blocked = (reason: string): BnbQuoteResult => ({ ...base, state: 'BLOCKED', reason });
  const failure = requestFailure(r);
  if (failure) return blocked(failure);
  if (r.contextId !== activeContext) return blocked('Network or route context changed');
  if (r.provider !== 'pancake-v3') return { ...base, state: 'UNVERIFIED', reason: BNB_PROVIDERS[r.provider].transport };
  if (!e) return { ...base, state: 'UNVERIFIED', reason: 'No current verified read-only observation' };
  if (!sameRequest(r, e.request)) return blocked('Quote context mismatch');
  if (e.source !== 'local-rpc' || !e.chainConfirmed || !e.identityConfirmed || !e.decimalsConfirmed || !e.codeConfirmed || !e.peerMatched || !e.canonical || !e.activeLiquidity
    || e.factory.toLowerCase() !== POOL_GATE.factory.toLowerCase() || !/^0x[\da-f]{40}$/i.test(e.pool) || !/^0x[\da-f]{64}$/i.test(e.blockHash)
    || !Number.isSafeInteger(e.blockNumber) || e.blockNumber <= 0 || ![100,500,2500,10000].includes(e.fee)
    || !BNB_OBSERVED_POOLS.some(p=>p.pair===r.pair && p.fee===e.fee && p.pool.toLowerCase()===e.pool.toLowerCase()) || !positiveInteger(e.amountOut)) return blocked('Pool, token, code or canonical evidence incomplete');
  if (e.archived || !quoteFresh(e.observedAt, e.blockTime, nowMs)) return { ...base, state: 'STALE', reason: 'Archived or expired · no current quote', blockNumber: e.blockNumber, observedAt: e.observedAt };
  return { ...base, state: 'READ_ONLY_QUOTE', reason: 'On-chain simulation only · no trading permission', amountOut: e.amountOut, blockNumber: e.blockNumber, observedAt: e.observedAt };
}
export interface BnbReadOnlyQuoteAdapter {
  readonly provider: BnbProvider;
  inspect(request: BnbQuoteRequest, activeContext: number, nowMs: number): BnbQuoteResult;
}
/** A display-only adapter: network transport and executable payloads deliberately absent. */
export function createBnbReadOnlyAdapter(provider: BnbProvider, evidence?: BnbQuoteEvidence): BnbReadOnlyQuoteAdapter {
  return { provider, inspect: (request, activeContext, nowMs) => request.provider !== provider
    ? { state: 'BLOCKED', reason: 'Adapter/provider mismatch', provider, executionEnabled: false, rwaGate: request.pair === 'USDT/XAUt' ? 'BLOCKED' : 'NOT_APPLICABLE' }
    : resolveBnbQuote(request, activeContext, nowMs, evidence) };
}