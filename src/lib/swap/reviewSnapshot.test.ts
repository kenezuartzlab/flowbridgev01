import { describe, expect, it } from "vitest";
import { createSwapReviewSnapshot, reviewChanged } from "./reviewSnapshot";
import type { QuoteResult } from "./quoter";

const quote: QuoteResult = { amountOut: 90n, symbolPath: ["BOT", "USDT"], path: ["0x0000000000000000000000000000000000000001"], steps: [{ dex: "bdex-v3", routerId: 0, router: "0x0000000000000000000000000000000000000002", path: ["0x0000000000000000000000000000000000000001", "0x0000000000000000000000000000000000000003"], symbolPath: ["BOT", "USDT"], inIsNative: true, outIsNative: false, expectedOut: 90n, v3Fee: 3000 }] };
const make = (q = quote, fee: bigint | string = 1n) => createSwapReviewSnapshot({ chainId: 677, tokenIn: "0x0000000000000000000000000000000000000000", tokenOut: "0x0000000000000000000000000000000000000003", amountIn: 100n, quote: q, minimumOut: 89n, protocolFee: fee });

describe("swap review snapshots", () => {
  it("keeps an identical review valid", () => expect(reviewChanged(make(), make())).toBe(false));
  it("invalidates changed output", () => expect(reviewChanged(make(), make({ ...quote, amountOut: 89n }))).toBe(true));
  it("invalidates changed protocol fee", () => expect(reviewChanged(make(), make(quote, 2n))).toBe(true));
  it("invalidates changed signature count", () => {
    const a = createSwapReviewSnapshot({ chainId: 677, tokenIn: "0x0", tokenOut: "0x1", amountIn: 1n, quote, minimumOut: 1n, protocolFee: 0n, approvalCount: 0, transactionCount: 1 });
    const b = createSwapReviewSnapshot({ chainId: 677, tokenIn: "0x0", tokenOut: "0x1", amountIn: 1n, quote, minimumOut: 1n, protocolFee: 0n, approvalCount: 1, transactionCount: 2 });
    expect(reviewChanged(a, b)).toBe(true);
  });
  it("invalidates changed route", () => expect(reviewChanged(make(), make({ ...quote, steps: [{ ...quote.steps[0], v3Fee: 500 }] }))).toBe(true));
});
