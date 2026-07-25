import { formatUnits, parseUnits } from "viem";
import { PLATFORM_FEE_BPS } from "@/lib/contracts";

/**
 * FlowBridgeRouter charges its protocol fee ON TOP of the swap amount:
 * it pulls `swapAmount + fee` from the user (or requires
 * `msg.value = swapAmount + fee` for native input).
 *
 * That means a "MAX" swap of the entire token balance always reverts with
 * `SafeERC20: call failed`, because `balance < swapAmount + fee`.
 * Every max/affordability calculation must therefore reserve the fee.
 */
export const routerFeeOnTop = (amount: bigint, bps: number = PLATFORM_FEE_BPS) =>
  (amount * BigInt(Math.max(0, Math.round(bps)))) / 10000n;

/** Total amount the router will pull from the wallet for `amount` of swap input. */
export const totalRouterDebit = (amount: bigint, bps?: number) =>
  amount + routerFeeOnTop(amount, bps);

/**
 * Largest swap amount whose `amount + fee` still fits inside `balance`.
 * Leaves 1 wei of head-room to absorb integer rounding on-chain.
 */
export function maxSwappableFromBalance(balance: bigint, bps: number = PLATFORM_FEE_BPS): bigint {
  if (balance <= 0n) return 0n;
  const denom = 10000n + BigInt(Math.max(0, Math.round(bps)));
  const usable = (balance * 10000n) / denom;
  return usable > 0n ? usable - 1n : 0n;
}

/** String-in / string-out variant for UI components that work with display values. */
export function maxSwappableDisplay(
  balanceDisplay: string,
  decimals: number,
  bps: number = PLATFORM_FEE_BPS,
): string {
  try {
    const raw = parseUnits(balanceDisplay || "0", decimals);
    return formatUnits(maxSwappableFromBalance(raw, bps), decimals);
  } catch {
    return balanceDisplay;
  }
}
