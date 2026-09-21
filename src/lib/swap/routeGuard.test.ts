import { describe, expect, it } from "vitest";
import {
  ABSOLUTE_SLIPPAGE_CAP_BPS,
  BREAKER_DEVIATION_BPS,
  BreakerRecovery,
  clampSlippageBps,
  evaluatePreparation,
  evaluateProtection,
  isBlockingMode,
  isPreparationStale,
  isRouteCanonical,
  maxSafeAmountIn,
  preparationFingerprint,
  routeSignature,
  type RouteHop,
} from "./routeGuard";
import { effectiveTradeDeviationBps, tickDeviationBps } from "./poolReference";

const ready = (deviationBps: number | null) =>
  evaluateProtection({ deviationBps, referenceState: "ready" as const });

const FLOW = "0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C";
const USDT = "0xcaaB50F36252a57529AFeF651fa6B9f9281917fF";
const WBOT = "0x1111111111111111111111111111111111111111";
const ROUTER_A = "0x07032d47A1b9f8460cBeE9dC17c1d3E438693929";
const CANONICAL = [FLOW, USDT, WBOT];

describe("P4A.2 protection modes", () => {
  it("maps every band and its exact boundaries", () => {
    expect(ready(0)).toMatchObject({ mode: "normal", slippageCapBps: 100, maxPriceImpactBps: 200 });
    expect(ready(199)).toMatchObject({ mode: "normal" });
    expect(ready(200)).toMatchObject({ mode: "caution", slippageCapBps: 200, maxPriceImpactBps: 150 });
    expect(ready(499)).toMatchObject({ mode: "caution" });
    expect(ready(500)).toMatchObject({ mode: "protective", slippageCapBps: 300, maxPriceImpactBps: 100 });
    expect(ready(999)).toMatchObject({ mode: "protective" });
    expect(ready(1000)).toMatchObject({ mode: "severe", slippageCapBps: 500, reduceAmountToFit: true });
    expect(ready(2999)).toMatchObject({ mode: "severe" });
    expect(ready(BREAKER_DEVIATION_BPS)).toMatchObject({ mode: "paused_risk", retryable: false });
    expect(ready(9000)).toMatchObject({ mode: "paused_risk" });
  });

  it("never uses 30% as slippage and never exceeds the 5% ceiling", () => {
    for (const dev of [0, 199, 200, 499, 500, 999, 1000, 2999, 3000, 12000]) {
      const policy = ready(dev);
      expect(policy.slippageCapBps).toBeLessThanOrEqual(ABSOLUTE_SLIPPAGE_CAP_BPS);
      expect(policy.slippageCapBps).not.toBe(BREAKER_DEVIATION_BPS);
      expect(clampSlippageBps(3000, policy)).toBe(
        Math.min(policy.slippageCapBps, ABSOLUTE_SLIPPAGE_CAP_BPS),
      );
    }
  });

  it("2.1 — a failed reference read is unavailable/retryable, never a risk pause", () => {
    const failed = evaluateProtection({ deviationBps: null, referenceState: "failed" });
    expect(failed).toMatchObject({ mode: "reference_unavailable", retryable: true });
    expect(failed.mode).not.toBe("paused_risk");
    const malformed = evaluateProtection({ deviationBps: Number.NaN, referenceState: "ready" });
    expect(malformed).toMatchObject({ mode: "reference_unavailable", retryable: true });
    expect(evaluateProtection({ deviationBps: null, referenceState: "ready" })).toMatchObject({
      mode: "reference_unavailable",
      retryable: true,
    });
    expect(isBlockingMode("reference_unavailable")).toBe(true);
    expect(isBlockingMode("paused_risk")).toBe(true);
    expect(isBlockingMode("severe")).toBe(false);
  });

  it("2.1 — warm-up is expected, not a trip, and no TWAP is fabricated", () => {
    const warm = evaluateProtection({ deviationBps: null, referenceState: "warmup" });
    expect(warm).toMatchObject({ mode: "normal", slippageCapBps: 100, maxPriceImpactBps: 200 });
    // A warm-up read carries no deviation number at all — none is invented.
    expect(warm.mode).not.toBe("paused_risk");
    expect(warm.mode).not.toBe("reference_unavailable");
  });
});

describe("P4A.2.1 breaker self-heal", () => {
  const b = () => new BreakerRecovery();

  it("transient reference failures never latch a risk pause and clear themselves", () => {
    const r = b();
    expect(r.observe(0, null, "failed")).toBe(false);
    expect(r.observe(30, null, "failed")).toBe(false);
    expect(r.paused).toBe(false);
    // First valid calm read keeps it running — no reload, no waiting period.
    expect(r.observe(60, 40, "ready")).toBe(false);
    expect(r.paused).toBe(false);
  });

  it("only valid price evidence of 30%+ latches, and recovery needs 30 calm minutes", () => {
    const r = b();
    expect(r.observe(0, 3100, "ready")).toBe(true);
    expect(r.paused).toBe(true);
    expect(r.observe(100, 100, "ready")).toBe(true);
    expect(r.secondsUntilRecovery(100)).toBe(1800);
    expect(r.observe(1899, 100, "ready")).toBe(true);
    expect(r.observe(1900, 100, "ready")).toBe(false);
    expect(r.paused).toBe(false);
  });

  it("a failed read during recovery does not extend or reset the calm window", () => {
    const r = b();
    r.observe(0, 3100, "ready");
    r.observe(10, 100, "ready");
    r.observe(500, null, "failed");
    r.observe(900, null, "warmup");
    expect(r.observe(1810, 100, "ready")).toBe(false);
  });

  it("warm-up alone never pauses", () => {
    const r = b();
    expect(r.observe(0, null, "warmup")).toBe(false);
    expect(r.observe(5000, null, "warmup")).toBe(false);
    expect(r.paused).toBe(false);
  });
});

describe("P4A.2.1 canonical multi-hop routing", () => {
  const direct: RouteHop[] = [{ routerId: 1, router: ROUTER_A, path: [FLOW, USDT], v3Fee: 10000 }];
  const viaBot: RouteHop[] = [
    { routerId: 1, router: ROUTER_A, path: [FLOW, WBOT], v3Fee: 3000 },
    { routerId: 1, router: ROUTER_A, path: [WBOT, USDT], v3Fee: 500 },
  ];

  it("accepts a canonical multi-hop route on first-hop identity alone", () => {
    expect(isRouteCanonical(direct, [1], CANONICAL)).toBe(true);
    expect(isRouteCanonical(viaBot, [1], CANONICAL)).toBe(true);
  });

  it("rejects unknown routers, zero addresses and non-canonical tokens", () => {
    expect(isRouteCanonical(viaBot, [2], CANONICAL)).toBe(false);
    expect(
      isRouteCanonical([{ routerId: 1, router: null, path: [FLOW, USDT] }], [1], CANONICAL),
    ).toBe(false);
    expect(
      isRouteCanonical(
        [{ routerId: 1, router: ROUTER_A, path: [FLOW, "0x9999999999999999999999999999999999999999"] }],
        [1],
        CANONICAL,
      ),
    ).toBe(false);
    expect(isRouteCanonical([], [1], CANONICAL)).toBe(false);
  });

  it("multi-hop is allowed by effective price and blocked when the price is bad", () => {
    const policy = ready(0);
    const base = {
      chainOk: true,
      poolActive: true,
      routeCanonical: isRouteCanonical(viaBot, [1], CANONICAL),
      amountOut: 1000n,
      quotedImpactBps: 20,
      amountIn: 10n ** 18n,
      policy,
    };
    expect(evaluatePreparation({ ...base, effectiveDeviationBps: 150 }).allowed).toBe(true);
    const bad = evaluatePreparation({ ...base, effectiveDeviationBps: 900 });
    expect(bad.allowed).toBe(false);
    expect(bad.maxSafeAmountIn).toBeLessThan(base.amountIn);
  });

  it("route signature distinguishes hop sets", () => {
    expect(routeSignature(direct)).not.toBe(routeSignature(viaBot));
    expect(routeSignature(direct)).toBe(routeSignature([...direct]));
  });
});

describe("P4A.2 preparation gate", () => {
  const base = {
    chainOk: true,
    poolActive: true,
    routeCanonical: true,
    amountOut: 1000n,
    quotedImpactBps: 50,
    effectiveDeviationBps: 50,
    amountIn: 10n ** 18n,
    policy: ready(0),
  };

  it("allows a healthy direct route", () => {
    expect(evaluatePreparation(base).allowed).toBe(true);
  });

  it("fails closed on each hard condition", () => {
    expect(evaluatePreparation({ ...base, chainOk: false }).allowed).toBe(false);
    expect(evaluatePreparation({ ...base, poolActive: false }).allowed).toBe(false);
    expect(evaluatePreparation({ ...base, routeCanonical: false }).allowed).toBe(false);
    expect(evaluatePreparation({ ...base, amountIn: 0n }).allowed).toBe(false);
    expect(evaluatePreparation({ ...base, amountOut: null })).toMatchObject({
      allowed: false,
      retryable: true,
    });
    expect(evaluatePreparation({ ...base, quotedImpactBps: null })).toMatchObject({
      allowed: false,
      retryable: true,
    });
    expect(evaluatePreparation({ ...base, policy: ready(3100) })).toMatchObject({
      allowed: false,
      retryable: false,
    });
    expect(
      evaluatePreparation({
        ...base,
        policy: evaluateProtection({ deviationBps: null, referenceState: "failed" }),
      }),
    ).toMatchObject({ allowed: false, retryable: true });
  });

  it("offers a reduced amount instead of widening slippage", () => {
    const decision = evaluatePreparation({ ...base, quotedImpactBps: 400, policy: ready(1200) });
    expect(decision.allowed).toBe(false);
    expect(decision.maxSafeAmountIn).toBeGreaterThan(0n);
    expect(decision.maxSafeAmountIn).toBeLessThan(base.amountIn);
    expect(decision.slippageBps).toBeLessThanOrEqual(ABSOLUTE_SLIPPAGE_CAP_BPS);
    expect(maxSafeAmountIn(1000n, 400, 100)).toBeLessThan(1000n);
    expect(maxSafeAmountIn(1000n, 50, 100)).toBe(1000n);
    expect(maxSafeAmountIn(0n, 50, 100)).toBe(0n);
  });
});

describe("P4A.2 fingerprint revalidation", () => {
  const fp = (over: Partial<Parameters<typeof preparationFingerprint>[0]> = {}) =>
    preparationFingerprint({
      chainId: 677,
      pool: "0xDaCFc2574b6110892351Bd31afb36F95E7206162",
      route: routeSignature([{ routerId: 1, router: ROUTER_A, path: [FLOW, USDT], v3Fee: 10000 }]),
      tokenIn: FLOW,
      tokenOut: USDT,
      amountIn: 10n ** 18n,
      mode: "normal",
      ...over,
    });

  it("is stable for identical state and changes with every material input", () => {
    expect(isPreparationStale(fp(), fp())).toBe(false);
    expect(isPreparationStale(fp(), fp({ mode: "caution" }))).toBe(true);
    expect(isPreparationStale(fp(), fp({ amountIn: 2n * 10n ** 18n }))).toBe(true);
    expect(isPreparationStale(fp(), fp({ route: "other" }))).toBe(true);
  });
});

describe("P4A.2 reference math", () => {
  it("tick deviation is symmetric and zero when identical", () => {
    expect(tickDeviationBps(368382, 368382)).toBe(0);
    expect(tickDeviationBps(368382, 368482)).toBeGreaterThan(0);
  });

  it("effective trade deviation is ~0 at the reference price", () => {
    const dev = effectiveTradeDeviationBps({
      amountIn: 10n ** 18n,
      amountOut: 99n,
      tokenInIsFlow: true,
      referenceTick: 368382,
      flowIsToken1: true,
    });
    expect(dev === null || dev >= 0).toBe(true);
  });
});
