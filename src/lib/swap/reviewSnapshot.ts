import type { QuoteResult } from "./quoter";
import { planExecution } from "./executionCapability";

export interface SwapReviewSnapshot {
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  minimumOut: string;
  protocolFee: string;
  approvalCount: number;
  transactionCount: number;
  execution: "ATOMIC_V4" | "STAGED";
  route: string;
}

export function routeMaterialSignature(quote: QuoteResult): string {
  return quote.steps.map((s) => [s.dex, s.routerId, s.router.toLowerCase(), s.path.map((p) => p.toLowerCase()).join(">"), s.v3Fee ?? 0].join(":" )).join("|");
}

export function createSwapReviewSnapshot(input: {
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  quote: QuoteResult;
  minimumOut: bigint;
  protocolFee: bigint | string;
  approvalCount?: number;
  transactionCount?: number;
}): SwapReviewSnapshot {
  return {
    chainId: input.chainId,
    tokenIn: input.tokenIn.toLowerCase(),
    tokenOut: input.tokenOut.toLowerCase(),
    amountIn: input.amountIn.toString(),
    amountOut: input.quote.amountOut.toString(),
    minimumOut: input.minimumOut.toString(),
    protocolFee: input.protocolFee.toString(),
    approvalCount: input.approvalCount ?? 0,
    transactionCount: input.transactionCount ?? (planExecution(input.quote.steps, input.chainId).execution === "ATOMIC_V4" ? 1 : input.quote.steps.length),
    execution: planExecution(input.quote.steps, input.chainId).execution,
    route: routeMaterialSignature(input.quote),
  };
}

/**
 * Structural fields always invalidate the review when they change: the user
 * approved a specific route, pair, fee and transaction shape, so any drift
 * there must be re-reviewed.
 */
const STRUCTURAL_KEYS: (keyof SwapReviewSnapshot)[] = [
  "chainId",
  "tokenIn",
  "tokenOut",
  "amountIn",
  "protocolFee",
  "approvalCount",
  "transactionCount",
  "execution",
  "route",
];

/**
 * Price fields (amountOut / minimumOut) move by a few wei whenever another
 * trade touches the pool between review and confirm. On-chain slippage
 * protection (minimumOut) already guards the user against adverse movement,
 * so a small drift within this tolerance must NOT bounce the user back to
 * review — otherwise active pairs become unusable (review → confirm →
 * rejected loops). Anything beyond the tolerance still invalidates.
 */
export const REVIEW_PRICE_TOLERANCE_BPS = 50n; // 0.5%

function withinTolerance(a: string, b: string, toleranceBps: bigint): boolean {
  const x = BigInt(a);
  const y = BigInt(b);
  if (x === y) return true;
  if (x === 0n || y === 0n) return false;
  const diff = x > y ? x - y : y - x;
  const base = x > y ? x : y;
  return diff * 10_000n <= base * toleranceBps;
}

export function reviewChanged(
  a: SwapReviewSnapshot,
  b: SwapReviewSnapshot,
  toleranceBps: bigint = REVIEW_PRICE_TOLERANCE_BPS,
): boolean {
  if (STRUCTURAL_KEYS.some((key) => a[key] !== b[key])) return true;
  if (!withinTolerance(a.amountOut, b.amountOut, toleranceBps)) return true;
  if (!withinTolerance(a.minimumOut, b.minimumOut, toleranceBps)) return true;
  return false;
}
