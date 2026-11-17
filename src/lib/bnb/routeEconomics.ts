/**
 * V1.7 pure route-economics math (BNB<>USDT, chain 56). Display/evidence only: no execution, no fee config.
 * All amounts are integer base units (18 decimals for WBNB and USDT on BSC). Fee hypotheses are PROPOSALS.
 */
export const FEE_HYPOTHESES_BPS = [0, 5, 10] as const;
export type Variant = 'DIRECT_PANCAKE_V3' | 'V1_6_FEE_ADAPTER' | 'ZEROX_AFFILIATE';
export type ProviderAccess = 'AVAILABLE' | 'BLOCKED_NO_CREDENTIALS' | 'UNVERIFIED';

/** Fee taken from output, floor-rounded exactly as the V1.6 candidate does: fee = out*bps/10000. */
export function platformFee(grossOut: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 0 || bps > 100) throw new Error('bps out of proposal range');
  if (grossOut < 0n) throw new Error('negative output');
  return (grossOut * BigInt(bps)) / 10_000n;
}
/** Gas cost in wei = gasUnits * gasPriceWei. */
export function gasCostWei(gasUnits: bigint, gasPriceWei: bigint): bigint {
  if (gasUnits < 0n || gasPriceWei < 0n) throw new Error('negative gas');
  return gasUnits * gasPriceWei;
}
/** Convert wei of BNB to output units using an observed rate (outPerBnbE18 = output units per 1e18 wei). */
export function weiToOutput(wei: bigint, outPerBnbE18: bigint): bigint { return (wei * outPerBnbE18) / 10n ** 18n; }

export interface NetInput { grossOut: bigint; feeBps: number; gasUnits: bigint; gasPriceWei: bigint; outPerBnbE18: bigint }
/**
 * User net value in output units after platform fee and the whole tx gas (gas counted once, never also
 * deducted as an AMM fee — the AMM pool fee is already inside grossOut from the quoter).
 */
export function netAfterFeeAndGas(i: NetInput) {
  const fee = platformFee(i.grossOut, i.feeBps);
  const gasOut = weiToOutput(gasCostWei(i.gasUnits, i.gasPriceWei), i.outPerBnbE18);
  return { fee, gasOut, net: i.grossOut - fee - gasOut };
}
/**
 * Minimum gross output (output units) at which the platform fee earns at least the user's extra gas cost
 * (fee >= extraGas). Below this the adapter costs the user more in gas than FlowBridge earns. bps=0 -> null.
 */
export function breakevenGrossOut(feeBps: number, extraGasUnits: bigint, gasPriceWei: bigint, outPerBnbE18: bigint): bigint | null {
  if (feeBps === 0) return null;
  const extra = weiToOutput(gasCostWei(extraGasUnits, gasPriceWei), outPerBnbE18);
  return (extra * 10_000n + BigInt(feeBps) - 1n) / BigInt(feeBps);
}
/** Total extra user cost (fee + extra gas) in bps of gross output, 2-decimal fixed (x100). */
export function userCostBpsX100(grossOut: bigint, fee: bigint, extraGasOut: bigint): bigint {
  if (grossOut <= 0n) throw new Error('zero output');
  return ((fee + extraGasOut) * 1_000_000n) / grossOut;
}
/** 0x and similar providers fail closed when there is no authenticated quote: never fabricate. */
export function providerQuoteStatus(access: ProviderAccess, quote: { buyAmount?: string } | null) {
  if (access !== 'AVAILABLE' || !quote || !/^\d+$/.test(quote.buyAmount ?? '')) return { status: 'BLOCKED' as const, buyAmount: null, executable: false as const };
  return { status: 'QUOTED_UNEXECUTABLE' as const, buyAmount: BigInt(quote.buyAmount!), executable: false as const };
}
