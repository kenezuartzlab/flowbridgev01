import type { SwapDraft } from '@/lib/trade/tradeSession';

export type SwapPairMode = 'ANY' | 'CA/BOT';

/** Fixed-pair shortcuts cannot inherit an unrelated Any pair draft. */
export function initialSwapPair(mode: SwapPairMode, draft: SwapDraft | null) {
  if (mode === 'CA/BOT') return { tokenInSymbol: 'CA', tokenOutSymbol: 'BOT', amount: '' };
  return {
    tokenInSymbol: draft?.tokenInSymbol ?? 'BOT',
    tokenOutSymbol: draft?.tokenOutSymbol ?? 'USDT',
    amount: draft?.amount ?? '',
  };
}