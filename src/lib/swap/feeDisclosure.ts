import { formatUnits } from "viem";

/**
 * Route-specific protocol fee disclosure. The only source of truth is the
 * selected router's own `computeRouterFee(routerId, amount, user)` read —
 * Router V3 and Router V4 are configured independently, so no global
 * percentage may be displayed as the fee a user will be charged.
 */
export const formatFeeBps = (bps: number): string =>
  `${Number((Math.max(0, bps) / 100).toFixed(4))}%`;

export interface FeeBreakdown {
  percent: string;
  swapAmount: string;
  fee: string;
  total: string;
}

export function buildFeeBreakdown(args: {
  swapAmount: bigint;
  fee: bigint;
  effectiveBps: number;
  decimals: number;
  symbol: string;
}): FeeBreakdown {
  const f = (v: bigint) => `${formatUnits(v, args.decimals)} ${args.symbol}`;
  return {
    percent: formatFeeBps(args.effectiveBps),
    swapAmount: f(args.swapAmount),
    fee: f(args.fee),
    total: f(args.swapAmount + args.fee),
  };
}
