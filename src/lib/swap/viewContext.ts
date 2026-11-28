import { BNB_SWAP_PUBLICATION_EMBARGO } from '@/lib/bnb/bnbSwapEmbargo';
/** View selection never authorizes a wallet transaction. BNB Swap is owner-embargoed. */
export type SwapView = 677 | 968;
export const PUBLIC_SWAP_VIEWS = [677, 968] as const;
export function isSwapView(value: number): value is SwapView {
  return BNB_SWAP_PUBLICATION_EMBARGO && (value === 677 || value === 968);
}
export function normalizeSwapView(value: number, isMainnet = true): SwapView {
  return isSwapView(value) ? value : isMainnet ? 677 : 968;
}
export function swapViewCanExecute(view: number, walletChain: number | undefined): boolean {
  return isSwapView(view) && walletChain === view;
}
