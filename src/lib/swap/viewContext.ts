/** View selection is not wallet permission or execution authorization. */
export type SwapView = 677 | 56 | 968;
export function isSwapView(value: number): value is SwapView {
  return value === 677 || value === 56 || value === 968;
}
export function swapViewCanExecute(view: number, walletChain: number | undefined): boolean {
  return (view === 677 || view === 968) && walletChain === view;
}