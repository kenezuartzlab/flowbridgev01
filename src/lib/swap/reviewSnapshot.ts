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
  protocolFee: bigint;
}): SwapReviewSnapshot {
  return {
    chainId: input.chainId,
    tokenIn: input.tokenIn.toLowerCase(),
    tokenOut: input.tokenOut.toLowerCase(),
    amountIn: input.amountIn.toString(),
    amountOut: input.quote.amountOut.toString(),
    minimumOut: input.minimumOut.toString(),
    protocolFee: input.protocolFee.toString(),
    execution: planExecution(input.quote.steps, input.chainId).execution,
    route: routeMaterialSignature(input.quote),
  };
}

export function reviewChanged(a: SwapReviewSnapshot, b: SwapReviewSnapshot): boolean {
  return Object.keys(a).some((key) => a[key as keyof SwapReviewSnapshot] !== b[key as keyof SwapReviewSnapshot]);
}
