import { describe, expect, it } from "vitest";
import { buildFeeBreakdown, formatFeeBps } from "./feeDisclosure";
import { routerFeeOnTop, totalRouterDebit } from "./platformFee";

describe("route fee disclosure", () => {
  it("1 bp is shown as 0.01%, never 0.1%", () => {
    expect(formatFeeBps(1)).toBe("0.01%");
    expect(formatFeeBps(0)).toBe("0%");
  });

  it("matches verified Router V3 tx 0x2e32d9c2…a21c533 exactly", () => {
    const swap = 10n ** 16n; // 0.01 BOT
    const fee = routerFeeOnTop(swap, 1);
    expect(fee).toBe(1_000_000_000_000n); // 0.000001 BOT, as logged on-chain
    expect(totalRouterDebit(swap, 1)).toBe(10_001_000_000_000_000n); // tx value
    const b = buildFeeBreakdown({ swapAmount: swap, fee, effectiveBps: 1, decimals: 18, symbol: "BOT" });
    expect(b).toEqual({ percent: "0.01%", swapAmount: "0.01 BOT", fee: "0.000001 BOT", total: "0.010001 BOT" });
  });
});
