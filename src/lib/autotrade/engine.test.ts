import { describe, expect, it } from "vitest";
import { AUTOTRADE_LIVE_ENABLED, AUTOTRADE_PUBLIC_ENABLED, pairById } from "./config";
import { apply, buyFloor, checkQuote, decide, newOrder, paperStep, parsePrice, sellFloor, splitRouterFee, validateSpec, type OrderSpec, type Quote } from "./engine";

const NOW = 1_800_000_000_000;
const BOTUSDT = pairById("BOT/USDT")!;
const spec = (o: Partial<OrderSpec> = {}): OrderSpec => ({
  pair: BOTUSDT, mode: "paper", budgetQuote: 100_000_000n /* 100 USDT */, maxBuyPrice: parsePrice("12.80"), minSellPrice: parsePrice("13.20"),
  stopPrice: null, slippageBps: 50, maxGasWeiPerLeg: 10n ** 16n, maxLossQuote: 5_000_000n, expiresAt: NOW + 3600_000, repeat: false, ...o,
});
const q = (amountIn: bigint, amountOut: bigint, o: Partial<Quote> = {}): Quote => ({
  amountIn, amountOut, block: 100, headBlock: 101, fetchedAt: NOW - 1000, crossCheckOut: amountOut, priceImpactBps: 20, gasUnits: 300_000n, gasPriceWei: 1_000_000_000n, ...o,
});
const FEE = 1;
const swapIn = (x: bigint) => splitRouterFee(x, FEE).swapAmount;

describe("AutoTrade V1 switches", () => {
  it("public and live are OFF and live orders cannot be created", () => {
    expect(AUTOTRADE_PUBLIC_ENABLED).toBe(false);
    expect(AUTOTRADE_LIVE_ENABLED).toBe(false);
    expect(() => newOrder("x", spec({ mode: "live" }), NOW)).toThrow("LIVE_DISABLED");
  });
});

describe("price bounds with decimals and fees", () => {
  it("buy floor: 100 USDT at max 12.80 USDT/BOT needs >= 7.8125 BOT (18 dp)", () => {
    expect(buyFloor(100_000_000n, parsePrice("12.80"), BOTUSDT)).toBe(7_812_500_000_000_000_000n);
  });
  it("sell floor: 7.8125 BOT at min 13.20 needs >= 103.125 USDT (6 dp), rounded up", () => {
    expect(sellFloor(7_812_500_000_000_000_000n, parsePrice("13.20"), BOTUSDT)).toBe(103_125_000n);
    expect(sellFloor(1n, parsePrice("13.20"), BOTUSDT)).toBe(1n);
  });
  it("router input fee 1 bp: 100 USDT pulls 99.990001 swap + 0.009999 fee", () => {
    expect(splitRouterFee(100_000_000n, 1)).toEqual({ swapAmount: 99_990_000n, fee: 9_999n });
  });
  it("rejects malformed prices", () => {
    for (const s of ["", "-1", "0", "1e3", "1.1234567890123456789"]) expect(() => parsePrice(s)).toThrow();
  });
});

describe("spec validation", () => {
  it.each([
    [{ repeat: true }, "REPEAT_NOT_SUPPORTED_V1"],
    [{ minSellPrice: parsePrice("12.00") }, "SELL_BELOW_BUY"],
    [{ stopPrice: parsePrice("13") }, "STOP_ABOVE_BUY"],
    [{ slippageBps: 301 }, "SLIPPAGE"],
    [{ expiresAt: NOW - 1 }, "EXPIRY"],
    [{ maxLossQuote: 200_000_000n }, "LIMITS"],
  ] as const)("%o -> %s", (o, err) => expect(validateSpec(spec(o as any), NOW)).toBe(err));
});

describe("quote guards fail closed", () => {
  const base = q(1n, 100n);
  it.each([
    [{ fetchedAt: NOW - 16_000 }, "STALE_QUOTE"],
    [{ block: 90 }, "STALE_BLOCK"],
    [{ amountOut: 0n, crossCheckOut: 0n }, "INSUFFICIENT_LIQUIDITY"],
    [{ crossCheckOut: null }, "NO_CROSS_CHECK"],
    [{ crossCheckOut: 99n, amountOut: 100n }, "SOURCE_DEVIATION"],
    [{ priceImpactBps: 301 }, "PRICE_IMPACT"],
  ] as const)("%o -> %s", (o, r) => expect(checkQuote({ ...base, ...o } as Quote, NOW)).toBe(r));
  it("gas above the per-leg limit is rejected", () => {
    const o = newOrder("g", spec(), NOW);
    expect(decide(o, q(swapIn(100_000_000n), 8n * 10n ** 18n, { gasPriceWei: 10n ** 12n }), NOW, FEE)).toEqual({ kind: "reject", reason: "GAS_LIMIT" });
  });
});

describe("buy then sell only the confirmed acquired amount", () => {
  it("waits when price is above the max buy, buys when met, minOut = price bound", () => {
    let o = newOrder("o1", spec(), NOW);
    expect(decide(o, q(swapIn(100_000_000n), 7n * 10n ** 18n), NOW, FEE)).toMatchObject({ kind: "wait", reason: "PRICE_NOT_MET" });
    const d = decide(o, q(swapIn(100_000_000n), 7_820_000_000_000_000_000n), NOW, FEE);
    expect(d.kind).toBe("submit");
    if (d.kind === "submit") expect(d.leg.minOut).toBe(7_812_500_000_000_000_000n); // price bound > slippage floor
    o = paperStep(o, q(swapIn(100_000_000n), 7_820_000_000_000_000_000n), NOW, FEE).order;
    expect(o.state).toBe("HOLDING");
    expect(o.acquiredBase).toBe(7_820_000_000_000_000_000n);
    // a quote for a different amount (e.g. the planned, not actual) is never used
    expect(decide(o, q(swapIn(7_812_500_000_000_000_000n), 200_000_000n), NOW, FEE)).toMatchObject({ reason: "QUOTE_AMOUNT_MISMATCH" });
    const sellIn = swapIn(o.acquiredBase);
    expect(decide(o, q(sellIn, 103_000_000n), NOW, FEE)).toMatchObject({ reason: "PRICE_NOT_MET" });
    o = paperStep(o, q(sellIn, 104_000_000n), NOW, FEE).order;
    expect(o.state).toBe("COMPLETED");
    expect(o.legs.map((l) => l.amountIn)).toEqual([100_000_000n, 7_820_000_000_000_000_000n]);
    expect(o.proceedsQuote).toBe(104_000_000n);
  });
  it("stop sells only within the loss limit", () => {
    let o = newOrder("s", spec({ stopPrice: parsePrice("12.00") }), NOW);
    o = paperStep(o, q(swapIn(100_000_000n), 8n * 10n ** 18n), NOW, FEE).order;
    const sellIn = swapIn(o.acquiredBase);
    expect(decide(o, q(sellIn, 94_000_000n), NOW, FEE)).toMatchObject({ kind: "wait", reason: "LOSS_LIMIT" });
    const d = decide(o, q(sellIn, 95_500_000n), NOW, FEE);
    expect(d).toMatchObject({ kind: "submit", stop: true });
    if (d.kind === "submit") expect(d.leg.minOut).toBe(95_500_000n * 9950n / 10_000n > 95_000_000n ? 95_500_000n * 9950n / 10_000n : 95_000_000n);
  });
});

describe("state machine idempotency and reconciliation", () => {
  const leg = { side: "buy" as const, idempotencyKey: "o:buy", amountIn: 1n, minOut: 10n, txHash: null, nonce: null, actualOut: null };
  it("no duplicate fills, no second leg while one is in flight, replays are no-ops", () => {
    let o = newOrder("o", spec(), NOW);
    o = apply(o, { type: "submitted", leg, txHash: "0xa", nonce: 1 });
    expect(() => apply(o, { type: "submitted", leg, txHash: "0xb", nonce: 2 })).toThrow("DUPLICATE_LEG");
    expect(() => apply(o, { type: "cancel" })).toThrow("LEG_IN_FLIGHT");
    expect(() => apply(o, { type: "confirmed", txHash: "0xa", actualOut: 11n, confirmations: 2 })).toThrow("NOT_FINAL");
    expect(() => apply(o, { type: "confirmed", txHash: "0xa", actualOut: 9n, confirmations: 6 })).toThrow("OUTPUT_BELOW_MIN");
    const c = apply(o, { type: "confirmed", txHash: "0xa", actualOut: 11n, confirmations: 6 });
    expect(apply(c, { type: "confirmed", txHash: "0xa", actualOut: 11n, confirmations: 7 })).toBe(c);
  });
  it("reorg of a confirmed buy returns to pending without resubmitting", () => {
    let o = apply(newOrder("o", spec(), NOW), { type: "submitted", leg, txHash: "0xa", nonce: 1 });
    o = apply(o, { type: "confirmed", txHash: "0xa", actualOut: 11n, confirmations: 6 });
    o = apply(o, { type: "reorged", txHash: "0xa" });
    expect(o.state).toBe("BUY_SUBMITTED");
    expect(o.acquiredBase).toBe(0n);
  });
  it("pause/resume/cancel and revert handling", () => {
    let o = newOrder("o", spec(), NOW);
    o = apply(o, { type: "pause" });
    expect(decide(o, q(1n, 1n), NOW, FEE)).toMatchObject({ kind: "wait", reason: "PAUSED" });
    o = apply(o, { type: "resume" });
    expect(o.state).toBe("ARMED");
    o = apply(apply(o, { type: "submitted", leg, txHash: "0xa", nonce: 1 }), { type: "reverted", txHash: "0xa" });
    expect(o.state).toBe("FAILED");
    expect(apply(o, { type: "cancel" }).state).toBe("CANCELLED");
  });
  it("expires an armed paper order", () => {
    const o = newOrder("e", spec(), NOW);
    expect(paperStep(o, q(1n, 1n), NOW + 3600_001, FEE).order.state).toBe("EXPIRED");
  });
});
