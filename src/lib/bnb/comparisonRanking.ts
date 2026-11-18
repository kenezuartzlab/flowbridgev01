/** V1.9 pure research ranking. No execution target, transaction or trading authority. */
import { validateZeroExRequest, type ZeroExDirection } from './zeroExPrice';
export const COMPARISON_LIMITS = Object.freeze({ ttlMs: 30_000, latencyMs: 5_000, blockGap: 12, windowMs: 15_000, driftBps: 5, impactBps: 100 });
export type ComparisonStatus = 'COMPARABLE' | 'STALE' | 'RATE_LIMITED' | 'PROVIDER_UNAVAILABLE' | 'FEE_UNKNOWN' | 'BLOCKED' | 'UNCOMPARABLE' | 'GAS_UNKNOWN' | 'TIE';
export type FeeSemantics = 'INCLUDED' | 'EXCLUDED' | 'UNKNOWN';
export interface ResearchQuote {
  id: string; provider: 'pancake-500' | 'pancake-2500' | '0x'; chainId: number;
  direction: ZeroExDirection; sellAmount: string; buyAmount: string;
  fee: string; feeToken: 'buy' | 'sell' | null; semantics: FeeSemantics;
  gasWei: string | null; gasClass: 'SIMULATION' | 'PROVIDER_ESTIMATE';
  observedAt: number; blockTime: number; block: number; latencyMs: number;
  provenance: boolean; archived: boolean; reused: boolean; impactBps: number; status: 'OK' | 'RATE_LIMITED' | 'UNAVAILABLE';
}
const E = 10n ** 18n;
const uint = (s: string | null): bigint | null => s !== null && /^(0|[1-9]\d{0,77})$/.test(s) && BigInt(s) < 2n ** 256n ? BigInt(s) : null;
/** Fee-excluded sell fees are converted at the observed average output rate, not falsely exact re-quotes. */
export function userNet(q: ResearchQuote, outputPerBnb: bigint, semantics = q.semantics): bigint | null {
  const buy = uint(q.buyAmount), sell = uint(q.sellAmount), fee = uint(q.fee), gas = uint(q.gasWei);
  if (buy === null || sell === null || sell === 0n || fee === null || gas === null || semantics === 'UNKNOWN' || outputPerBnb <= 0n) return null;
  const feeOut = semantics === 'INCLUDED' ? 0n : q.feeToken === 'buy' ? fee : q.feeToken === 'sell' ? fee * buy / sell : 0n;
  return buy - feeOut - gas * outputPerBnb / E;
}
export function quoteStatus(q: ResearchQuote, now: number): ComparisonStatus {
  if (q.chainId !== 56 || !validateZeroExRequest({ direction: q.direction, sellAmount: q.sellAmount }).ok || !['pancake-500','pancake-2500','0x'].includes(q.provider) || !q.provenance) return 'BLOCKED';
  if (q.status === 'RATE_LIMITED') return 'RATE_LIMITED';
  if (q.status !== 'OK') return 'PROVIDER_UNAVAILABLE';
  if (q.archived || q.reused || !Number.isSafeInteger(q.block) || q.block <= 0 || ![q.observedAt,q.blockTime,q.latencyMs,q.impactBps].every(Number.isFinite) || now < q.observedAt || now < q.blockTime || now-q.observedAt > COMPARISON_LIMITS.ttlMs || now-q.blockTime > COMPARISON_LIMITS.ttlMs) return 'STALE';
  if (q.latencyMs < 0 || q.latencyMs > COMPARISON_LIMITS.latencyMs || q.impactBps < 0 || q.impactBps > COMPARISON_LIMITS.impactBps) return 'UNCOMPARABLE';
  const fee=uint(q.fee), buy=uint(q.buyAmount), sell=uint(q.sellAmount);
  if (fee===null || buy===null || buy===0n || sell===null || (fee>0n && q.feeToken===null) || (q.feeToken==='buy' && fee>=buy) || (q.feeToken==='sell' && fee>=sell)) return 'BLOCKED';
  if (uint(q.gasWei) === null || uint(q.gasWei) === 0n) return 'GAS_UNKNOWN';
  if (q.semantics === 'UNKNOWN') return 'FEE_UNKNOWN';
  return 'COMPARABLE';
}
export function rankResearchQuotes(quotes: ResearchQuote[], now: number, outputPerBnb: bigint, driftBps: number) {
  const base = { executable: false as const, candidate: null as string | null };
  if (quotes.length < 2 || new Set(quotes.map(q=>q.id)).size !== quotes.length || outputPerBnb<=0n) return {...base,status:'BLOCKED' as ComparisonStatus};
  for (const q of quotes) { const s=quoteStatus(q,now); if(s!=='COMPARABLE') return {...base,status:s}; }
  const first=quotes[0];
  if (!first || quotes.some(q=>q.direction!==first.direction || q.sellAmount!==first.sellAmount)) return {...base,status:'BLOCKED' as ComparisonStatus};
  if (!Number.isFinite(driftBps) || driftBps<0 || driftBps>COMPARISON_LIMITS.driftBps || Math.max(...quotes.map(q=>q.block))-Math.min(...quotes.map(q=>q.block))>COMPARISON_LIMITS.blockGap || Math.max(...quotes.map(q=>q.observedAt))-Math.min(...quotes.map(q=>q.observedAt))>COMPARISON_LIMITS.windowMs) return {...base,status:'UNCOMPARABLE' as ComparisonStatus};
  const values=quotes.map(q=>({id:q.id,net:userNet(q,outputPerBnb)}));
  if(values.some(v=>v.net===null || v.net<=0n)) return {...base,status:'BLOCKED' as ComparisonStatus};
  values.sort((a,b)=>a.net===b.net?a.id.localeCompare(b.id):(a.net??0n)>(b.net??0n)?-1:1);
  if(values[0]?.net===values[1]?.net) return {...base,status:'TIE' as ComparisonStatus};
  return {...base,status:'COMPARABLE' as ComparisonStatus,candidate:values[0]?.id??null};
}