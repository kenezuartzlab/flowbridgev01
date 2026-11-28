// V1.13 wallet/routing/MEV review policy — PREVIEW ONLY, pure, no network, no calldata/allowance/signer fields.
// It decides whether a hypothetical review *would* be presentable; signing is never permitted while
// BNB_EXECUTION_ENABLED is false. Mirrors V1.13 on-chain limits so the UI can never promise more than the contract checks.
import { BNB_EXECUTION_ENABLED } from './bnbSwapEmbargo';
export { BNB_EXECUTION_ENABLED } from './bnbSwapEmbargo';
export const REVIEW_LIMITS = {
  chainId: 56,
  tiers: [500, 2500] as const,
  maxQuoteAgeSec: 30,
  maxBlockLag: 100,
  maxDeadlineSec: 120,
  maxBnbInWei: 10n ** 18n,
  maxUsdtInWei: 1000n * 10n ** 18n,
  maxSlippageBps: 100, // review ceiling; user must explicitly approve the resulting minNetOut
  defaultSlippageBps: 50,
} as const;

export type ReviewContext = { chainId: number; account: string; tokenIn: 'WBNB' | 'USDT'; tokenOut: 'WBNB' | 'USDT'; poolFee: number; amountIn: bigint };
export type QuoteEvidence = ReviewContext & { source: 'PANCAKE_V3_QUOTER' | '0X_PRICE'; quotedNetOut: bigint; quotedAtSec: number; quoteBlock: number };
export type ReviewInput = { quote: QuoteEvidence; current: ReviewContext; nowSec: number; currentBlock: number; approvedMinNetOut: bigint | null; slippageBps: number };
export type ReviewReason =
  | 'EXECUTION_DISABLED' | 'WRONG_CHAIN' | 'CONTEXT_CHANGED' | 'UNSUPPORTED_TIER' | 'UNSUPPORTED_PAIR' | 'INDICATIVE_SOURCE_NOT_EXECUTABLE'
  | 'QUOTE_STALE_TIME' | 'QUOTE_STALE_BLOCKS' | 'QUOTE_FROM_FUTURE' | 'AMOUNT_ZERO' | 'AMOUNT_OVER_CAP'
  | 'MIN_NET_NOT_APPROVED' | 'MIN_NET_ZERO' | 'MIN_NET_ABOVE_QUOTE' | 'SLIPPAGE_TOO_WIDE' | 'MIN_NET_BELOW_SLIPPAGE_FLOOR';
export type ReviewResult = { presentable: boolean; canSign: false; reasons: ReviewReason[]; slippageFloor: bigint | null };

const same = (a: ReviewContext, b: ReviewContext) =>
  a.chainId === b.chainId && a.account.toLowerCase() === b.account.toLowerCase() && a.tokenIn === b.tokenIn && a.tokenOut === b.tokenOut && a.poolFee === b.poolFee && a.amountIn === b.amountIn;

export function slippageFloor(net: bigint, bps: number): bigint { return (net * BigInt(10_000 - bps)) / 10_000n; }

export function reviewBnbSwap(i: ReviewInput): ReviewResult {
  const r: ReviewReason[] = [];
  const L = REVIEW_LIMITS, q = i.quote, c = i.current;
  if (c.chainId !== L.chainId || q.chainId !== L.chainId) r.push('WRONG_CHAIN');
  if (!same(q, c)) r.push('CONTEXT_CHANGED'); // account, network, token, tier or amount change invalidates the quote
  if (!(L.tiers as readonly number[]).includes(c.poolFee)) r.push('UNSUPPORTED_TIER');
  if (c.tokenIn === c.tokenOut) r.push('UNSUPPORTED_PAIR');
  // 0x Price is indicative and never a fallback executor for the custom adapter (no calldata, different spender).
  if (q.source !== 'PANCAKE_V3_QUOTER') r.push('INDICATIVE_SOURCE_NOT_EXECUTABLE');
  if (q.quotedAtSec > i.nowSec || q.quoteBlock >= i.currentBlock) r.push('QUOTE_FROM_FUTURE');
  else {
    if (i.nowSec - q.quotedAtSec > L.maxQuoteAgeSec) r.push('QUOTE_STALE_TIME');
    if (i.currentBlock - q.quoteBlock > L.maxBlockLag) r.push('QUOTE_STALE_BLOCKS');
  }
  if (c.amountIn <= 0n) r.push('AMOUNT_ZERO');
  else if (c.amountIn > (c.tokenIn === 'WBNB' ? L.maxBnbInWei : L.maxUsdtInWei)) r.push('AMOUNT_OVER_CAP');
  let floor: bigint | null = null;
  if (!Number.isInteger(i.slippageBps) || i.slippageBps < 0 || i.slippageBps > L.maxSlippageBps) r.push('SLIPPAGE_TOO_WIDE');
  else floor = slippageFloor(q.quotedNetOut, i.slippageBps);
  if (i.approvedMinNetOut === null) r.push('MIN_NET_NOT_APPROVED');
  else if (i.approvedMinNetOut <= 0n) r.push('MIN_NET_ZERO');
  else if (i.approvedMinNetOut > q.quotedNetOut) r.push('MIN_NET_ABOVE_QUOTE');
  else if (floor !== null && i.approvedMinNetOut < floor) r.push('MIN_NET_BELOW_SLIPPAGE_FLOOR');
  const presentable = r.length === 0;
  if (!BNB_EXECUTION_ENABLED) r.push('EXECUTION_DISABLED');
  return { presentable, canSign: false, reasons: r, slippageFloor: floor };
}
