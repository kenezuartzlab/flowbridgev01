import { describe, expect, it } from "vitest";
import { buildPaperRequest, equivalentBudget, orderFromPaperRequest, percentToBps, type PaperDraft } from "./paperForm";

const screenshot: PaperDraft = { pair: "CA/BOT", budget: "5", maxBuyPrice: "2", minSellPrice: "2.5", stopPrice: "", slippagePercent: "0.5", maxGasNative: "0.05", maxLoss: "5", expiresInMinutes: "60" };
describe("owner paper screenshot parameters", () => {
  it("accepts the exact screenshot as a 5 BOT paper order, not a 5 USDT live order", () => {
    const body = buildPaperRequest(screenshot, null, 1000);
    const order = orderFromPaperRequest(body, "paper", 1000);
    expect(order.spec.mode).toBe("paper"); expect(order.state).toBe("ARMED");
    expect(order.spec.budgetQuote).toBe(5_000_000_000_000_000_000n);
    expect(order.spec.maxBuyPrice).toEqual({ num: 2n, den: 1n });
    expect(order.spec.minSellPrice).toEqual({ num: 25n, den: 10n });
    expect(order.spec.stopPrice).toBeNull(); expect(order.spec.slippageBps).toBe(50);
    expect(order.spec.maxGasWeiPerLeg).toBe(50_000_000_000_000_000n);
    expect(order.spec.maxLossQuote).toBe(5_000_000_000_000_000_000n);
    expect(order.spec.expiresAt).toBe(3_601_000); expect(order.spec.repeat).toBe(false);
  });
  it("rejects missing prices rather than creating defaults", () => {
    expect(() => buildPaperRequest({ ...screenshot, maxBuyPrice: "" }, null, 1000)).toThrow();
  });
  it("converts 0.5 percent to exactly 50 bps", () => { expect(percentToBps("0.5")).toBe(50); });
  it("rejects slippage above the unchanged 3 percent guard", () => { expect(() => percentToBps("3.01")).toThrow(); });
  it("rejects excessive quote precision rather than rounding", () => {
    expect(() => buildPaperRequest({ ...screenshot, pair: "CA/USDT", budget: "5.0000001" }, null, 1000)).toThrow("at most 6");
  });
  it("rejects an inverted target", () => { expect(() => buildPaperRequest({ ...screenshot, minSellPrice: "1.9" }, null, 1000)).toThrow("at or above"); });
  it("requires fresh evidence for the USDT-equivalent entry option", () => {
    expect(() => buildPaperRequest({ ...screenshot, budgetUnit: "USDT_EQUIVALENT" }, null, 1000)).toThrow("Refresh");
  });
  it("uses exact fixed-point conversion without inventing a market rate", () => {
    expect(equivalentBudget("5", "10")).toBe("0.5");
    const request = buildPaperRequest({ ...screenshot, budgetUnit: "USDT_EQUIVALENT", maxLoss: "0.5" }, { pair: "CA/BOT", price: "2", inverse: "0.5", usdtPerBot: "10", block: 1, fetchedAt: 1000, expiresAt: 16000 }, 1000);
    expect(request.reviewedBudget).toBe("0.5"); expect(request.budgetUnit).toBe("USDT_EQUIVALENT");
  });
  it("rejects max loss above the converted BOT budget", () => {
    expect(() => buildPaperRequest({ ...screenshot, budgetUnit: "USDT_EQUIVALENT" }, { pair: "CA/BOT", price: "2", inverse: "0.5", usdtPerBot: "10", block: 1, fetchedAt: 1000, expiresAt: 16000 }, 1000)).toThrow("Max loss");
  });
});