import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { BNB_EXECUTION_ENABLED, REVIEW_LIMITS, reviewBnbSwap, slippageFloor, type ReviewInput } from './executionReviewPolicy';
const E = 10n ** 18n;
const ctx = { chainId: 56, account: '0x00000000000000000000000000000000000000a1', tokenIn: 'WBNB' as const, tokenOut: 'USDT' as const, poolFee: 500, amountIn: E / 100n };
const base = (p: Partial<ReviewInput> = {}): ReviewInput => ({ quote: { ...ctx, source: 'PANCAKE_V3_QUOTER', quotedNetOut: 6n * E, quotedAtSec: 1000, quoteBlock: 500 }, current: { ...ctx }, nowSec: 1010, currentBlock: 520, approvedMinNetOut: slippageFloor(6n * E, 50), slippageBps: 50, ...p });
const reasons = (p: Partial<ReviewInput>) => reviewBnbSwap(base(p)).reasons;
describe('V1.13 BNB review policy (preview only)', () => {
  it('execution stays disabled: a fully valid review is presentable but can never sign', () => { const r = reviewBnbSwap(base()); expect(BNB_EXECUTION_ENABLED).toBe(false); expect(r.presentable).toBe(true); expect(r.canSign).toBe(false); expect(r.reasons).toEqual(['EXECUTION_DISABLED']); });
  for (const [name, patch] of [['account', { account: '0x00000000000000000000000000000000000000b2' }], ['network', { chainId: 677 }], ['token', { tokenIn: 'USDT', tokenOut: 'WBNB' }], ['tier', { poolFee: 2500 }], ['amount', { amountIn: E / 50n }]] as const)
    it(`changing ${name} after quoting invalidates the review`, () => { expect(reasons({ current: { ...ctx, ...patch } as any })).toContain('CONTEXT_CHANGED'); });
  it('account comparison is case-insensitive (checksummed RPC addresses)', () => { expect(reasons({ current: { ...ctx, account: ctx.account.toUpperCase().replace('0X', '0x') } })).not.toContain('CONTEXT_CHANGED'); });
  it('quote age: 30s ok, 31s stale', () => { expect(reasons({ nowSec: 1030 })).not.toContain('QUOTE_STALE_TIME'); expect(reasons({ nowSec: 1031 })).toContain('QUOTE_STALE_TIME'); });
  it('block lag: 100 ok, 101 stale; same/future block rejected', () => { expect(reasons({ currentBlock: 600 })).not.toContain('QUOTE_STALE_BLOCKS'); expect(reasons({ currentBlock: 601 })).toContain('QUOTE_STALE_BLOCKS'); expect(reasons({ currentBlock: 500 })).toContain('QUOTE_FROM_FUTURE'); });
  it('only tiers 500 and 2500', () => { for (const t of [100, 10000]) expect(reasons({ quote: { ...base().quote, poolFee: t }, current: { ...ctx, poolFee: t } })).toContain('UNSUPPORTED_TIER'); });
  it('0x Price is indicative and never an execution fallback', () => { expect(reasons({ quote: { ...base().quote, source: '0X_PRICE' } })).toContain('INDICATIVE_SOURCE_NOT_EXECUTABLE'); });
  it('caps mirror the contract (1 BNB, 1000 USDT)', () => { const over = { ...ctx, amountIn: REVIEW_LIMITS.maxBnbInWei + 1n }; expect(reasons({ quote: { ...base().quote, ...over }, current: over })).toContain('AMOUNT_OVER_CAP'); const u = { ...ctx, tokenIn: 'USDT' as const, tokenOut: 'WBNB' as const, amountIn: REVIEW_LIMITS.maxUsdtInWei }; expect(reasons({ quote: { ...base().quote, ...u }, current: u })).not.toContain('AMOUNT_OVER_CAP'); });
  it('minNetOut must be explicitly user-approved, positive, not above quote, within slippage', () => {
    expect(reasons({ approvedMinNetOut: null })).toContain('MIN_NET_NOT_APPROVED');
    expect(reasons({ approvedMinNetOut: 0n })).toContain('MIN_NET_ZERO');
    expect(reasons({ approvedMinNetOut: 6n * E + 1n })).toContain('MIN_NET_ABOVE_QUOTE');
    expect(reasons({ approvedMinNetOut: slippageFloor(6n * E, 50) - 1n })).toContain('MIN_NET_BELOW_SLIPPAGE_FLOOR');
    expect(reasons({ slippageBps: 101 })).toContain('SLIPPAGE_TOO_WIDE');
  });
  it('slippage floor: 50 bps of 6 USDT is exactly 5.97 USDT', () => { expect(slippageFloor(6n * E, 50)).toBe(5970000000000000000n); });
  it('module carries no executable fields in code or result', () => {
    const s = fs.readFileSync('src/lib/bnb/executionReviewPolicy.ts', 'utf8').replace(/\/\/.*$/gm, '');
    expect(Object.keys(reviewBnbSwap(base())).sort()).toEqual(['canSign', 'presentable', 'reasons', 'slippageFloor']);
    expect(s).not.toMatch(/calldata|spender|signTransaction|sendTransaction|eth_send|approve\(/i);
  });
});
