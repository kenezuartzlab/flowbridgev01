// V1.17 owner-selected BNB adapter fee policy — PURE, NON-EXECUTABLE.
// Mirrors frozen V1.13 output-side math. No network, signer, approval, calldata or execution path.
import { BNB_EXECUTION_ENABLED } from './executionReviewPolicy';
import { OWNER_DIRECT_EOA_ADDRESSES, OWNER_SELECTED_FEE_BPS } from './launchReadiness';

export const BPS_DENOMINATOR = 10_000n;
export const FEE_POLICY = {
  bps: OWNER_SELECTED_FEE_BPS,
  ratePercent: '0.05%',
  side: 'OUTPUT',
  intendedRecipient: OWNER_DIRECT_EOA_ADDRESSES.treasury,
  status: 'FEE_RATE_SELECTED_PAYABLE_CONFIGURATION_NOT_AUTHORIZED',
  payableConfigurationAuthorized: false,
  feesChargedNow: false,
  executionEnabled: BNB_EXECUTION_ENABLED,
} as const;

export type Direction = 'BNB_TO_USDT' | 'USDT_TO_BNB';
export type AmountKind = 'ESTIMATED' | 'ACTUAL';

/** fee = floor(grossOut * bps / 10000); userNet = grossOut - fee. Exactly V1.13 `_settle`. */
export function splitOutput(grossOut: bigint, bps: number = FEE_POLICY.bps) {
  if (grossOut < 0n) throw new RangeError('NEGATIVE_GROSS');
  if (![0, 5, 10].includes(bps)) throw new RangeError('UNSUPPORTED_BPS');
  const fee = (grossOut * BigInt(bps)) / BPS_DENOMINATOR;
  return { grossOut, fee, userNet: grossOut - fee };
}

/** Smallest gross that yields `minNetOut` after fee — V1.13 `_grossMinimum`. The fee is applied once, here only. */
export function grossFloorForNet(minNetOut: bigint, bps: number = FEE_POLICY.bps): bigint {
  if (minNetOut <= 0n) throw new RangeError('BAD_MIN_NET');
  return ((minNetOut - 1n) * BPS_DENOMINATOR) / (BPS_DENOMINATOR - BigInt(bps)) + 1n;
}

/**
 * User-approved net minimum from an estimated gross quote and slippage (bps).
 * Slippage is applied to the post-fee net; the fee is NOT deducted a second time.
 */
export function minNetFromEstimate(estimatedGrossOut: bigint, slippageBps: number, bps: number = FEE_POLICY.bps): bigint {
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps >= 10_000) throw new RangeError('BAD_SLIPPAGE');
  const { userNet } = splitOutput(estimatedGrossOut, bps);
  const min = (userNet * (BPS_DENOMINATOR - BigInt(slippageBps))) / BPS_DENOMINATOR;
  return min > 0n ? min : 0n;
}

export const FEE_ASSET: Record<Direction, { feePaidIn: 'USDT' | 'WBNB'; userReceives: 'USDT' | 'NATIVE_BNB' }> = {
  BNB_TO_USDT: { feePaidIn: 'USDT', userReceives: 'USDT' },
  USDT_TO_BNB: { feePaidIn: 'WBNB', userReceives: 'NATIVE_BNB' },
};

export const FEE_DISCLOSURES = [
  'FlowBridge service fee: 0.05% (5 bps) of the swap output, taken once from the output.',
  'BNB → USDT: the service fee is paid in USDT. USDT → BNB: the service fee is paid in WBNB and you receive net native BNB.',
  'Your minimum received already includes the service fee; it is not deducted twice.',
  'Additional PancakeSwap pool fees (0.05% or 0.25% tier) and BNB Chain network gas apply separately and are not estimated here.',
  'Quoted amounts are estimates; only the settled on-chain amounts are actual.',
  'BNB swaps are not enabled; no fee is charged now.',
] as const;

/** Display-only breakdown. `kind` must be ACTUAL only when supplied from a settled receipt by the caller. */
export function describeFee(direction: Direction, grossOut: bigint, kind: AmountKind = 'ESTIMATED') {
  const split = splitOutput(grossOut);
  return {
    ...split,
    kind,
    direction,
    ...FEE_ASSET[direction],
    bps: FEE_POLICY.bps,
    ratePercent: FEE_POLICY.ratePercent,
    poolFeeIncluded: false as const,
    gasEstimate: null,
    disclosures: FEE_DISCLOSURES,
    executable: false as const,
  };
}
