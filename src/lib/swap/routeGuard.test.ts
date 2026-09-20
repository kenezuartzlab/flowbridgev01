import { describe, expect, it } from "vitest";
import {
  ABSOLUTE_SLIPPAGE_CAP_BPS,
  BREAKER_DEVIATION_BPS,
  BreakerRecovery,
  clampSlippageBps,
  evaluatePreparation,
  evaluateProtection,
  isPreparationStale,
  maxSafeAmountIn,
  preparationFingerprint,
} from "./routeGuard";
import { tickDeviationBps } from "./poolReference";

const ready = (deviationBps: number | null) =>
  evaluateProtection({ deviationBps, referenceState: "ready" as const });

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
    expect(ready(BREAKER_DEVIATION_BPS)).toMatchObject({ mode: "paused" });
    expect(ready(9000)).toMatchObject({ mode: "paused" });
  });

  it("never uses 30% as slippage and never exceeds the 5% ceiling", () => {
    for (const dev of [0, 199, 200, 499, 500, 999, 1000, 2999, 3000, 12000]) {
      const policy = ready(dev);
      expect(policy.slippageCapBps).toBeLessThanOrEqual(ABSOLUTE_SLIPPAGE_CAP_BPS);
      expect(policy.slippageCapBps).not.toBe(BREAKER_DEVIATION_BPS);
      expect(clampSlippageBps(3000, policy)).toBeLessThanOrEqual(ABSOLUTE_SLIPPAGE_CAP_BPS);
      expect(clampSlippageBps(3000, policy)).toBe(Math.min(policy.slippageCapBps, ABSOLUTE_SLIPPAGE_CAP_BPS));
    }
  });

  it("keeps normal 1% during warm-up but fails closed on reference failure", () => {
    expect(evaluateProtection({ deviationBps: null, referenceState: "warmup" })).toMatchObject({
      mode: "normal",
      slippageCapBps: 100,
      maxPriceImpactBps: 200,
    });
    expect(evaluateProtection({ deviationBps: null, referenceState: "failed" })).toMatchObject({ mode: "paused" });
    expect(evaluateProtection({ deviationBps: Number.NaN, referenceState: "ready" })).toMatchObject({ mode: "paused" });
    expect(evaluateProtection({ deviationBps: null, referenceState: "ready" })).toMatchObject({ mode: "paused" });
  });
});

describe("P4A.2 preparation gate", () => {
  const base = {
    chainOk: true,
    poolActive: true,
    routeFee: 10000,
    expectedRouteFee: 10000,
    amountOut: 1000n,
    quotedImpactBps: 50,
    amountIn: 10n ** 18n,
    policy: ready(0),
  };

  it("allows a normal in-limit trade", () => {
    const d = evaluatePreparation(base);
    expect(d.allowed).toBe(true);
    expect(d.slippageBps).toBe(100);
  });

  it("blocks wrong chain, dead pool, fee mismatch and failed quote", () => {
    expect(evaluatePreparation({ ...base, chainOk: false }).allowed).toBe(false);
    expect(evaluatePreparation({ ...base, poolActive: false }).allowed).toBe(false);
    expect(evaluatePreparation({ ...base, routeFee: 3000 }).allowed).toBe(false);
    expect(evaluatePreparation({ ...base, routeFee: null }).allowed).toBe(false);
    expect(evaluatePreparation({ ...base, amountOut: 0n }).allowed).toBe(false);
    expect(evaluatePreparation({ ...base, amountOut: null }).allowed).toBe(false);
    expect(evaluatePreparation({ ...base, quotedImpactBps: null }).allowed).toBe(false);
    expect(evaluatePreparation({ ...base, amountIn: 0n }).allowed).toBe(false);
  });

  it("blocks while paused regardless of an otherwise perfect quote", () => {
    const d = evaluatePreparation({ ...base, policy: ready(3000) });
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain("Circuit breaker");
  });

  it("returns a smaller maximum-safe amount for an oversized trade", () => {
    const d = evaluatePreparation({ ...base, quotedImpactBps: 800 });
    expect(d.allowed).toBe(false);
    expect(d.maxSafeAmountIn).toBeDefined();
    expect(d.maxSafeAmountIn!).toBeLessThan(base.amountIn);
    expect(d.maxSafeAmountIn!).toBeGreaterThan(0n);
  });

  it("scales the safe amount by the impact ceiling with a safety margin", () => {
    expect(maxSafeAmountIn(1000n, 50, 200)).toBe(1000n);
    expect(maxSafeAmountIn(1000n, 400, 200)).toBe(475n);
    expect(maxSafeAmountIn(0n, 400, 200)).toBe(0n);
    expect(maxSafeAmountIn(1000n, 400, 0)).toBe(0n);
  });
});

describe("P4A.2 revalidation before signing", () => {
  const fp = {
    chainId: 677,
    pool: "0xDaCFc2574b6110892351Bd31afb36F95E7206162",
    routerId: 2,
    routeFee: 10000,
    tokenIn: "0xcaaB50F36252a57529AFeF651fa6B9f9281917fF",
    tokenOut: "0xababc7ddc03e501d190c676bf3d92ef0e6e87a3c",
    amountIn: 10n ** 18n,
    mode: "normal" as const,
  };

  it("is stable for identical state and case-insensitive on addresses", () => {
    expect(isPreparationStale(preparationFingerprint(fp), preparationFingerprint({ ...fp, pool: fp.pool.toUpperCase().replace("0X", "0x") }))).toBe(false);
  });

  it("invalidates on changed chain, pool, route, amount or mode", () => {
    const approved = preparationFingerprint(fp);
    for (const change of [
      { chainId: 1 },
      { pool: "0x0000000000000000000000000000000000000001" },
      { routerId: 3 },
      { routeFee: 3000 },
      { amountIn: 2n * 10n ** 18n },
      { mode: "caution" as const },
    ]) {
      expect(isPreparationStale(approved, preparationFingerprint({ ...fp, ...change }))).toBe(true);
    }
  });
});

describe("P4A.2 breaker recovery timer", () => {
  it("requires 30 continuous minutes within 5% before unpausing", () => {
    const r = new BreakerRecovery();
    expect(r.observe(0, 100, "ready")).toBe(false);
    expect(r.observe(10, 3500, "ready")).toBe(true);
    expect(r.paused).toBe(true);
    expect(r.observe(20, 400, "ready")).toBe(true);
    expect(r.secondsUntilRecovery(20)).toBe(1800);
    expect(r.observe(1000, 400, "ready")).toBe(true);
    expect(r.observe(1819, 400, "ready")).toBe(true);
    expect(r.observe(1820, 400, "ready")).toBe(false);
    expect(r.paused).toBe(false);
  });

  it("restarts the timer when deviation leaves the 5% band", () => {
    const r = new BreakerRecovery();
    r.observe(0, 4000, "ready");
    r.observe(100, 300, "ready");
    expect(r.observe(1000, 900, "ready")).toBe(true);
    expect(r.secondsUntilRecovery(1000)).toBe(1800);
    r.observe(1100, 300, "ready");
    expect(r.observe(2800, 300, "ready")).toBe(true);
    expect(r.observe(2900, 300, "ready")).toBe(false);
  });

  it("stays paused while reference reads fail", () => {
    const r = new BreakerRecovery();
    expect(r.observe(0, null, "failed")).toBe(true);
    expect(r.observe(5000, 100, "warmup")).toBe(true);
    expect(r.observe(5000, 100, "ready")).toBe(true);
    expect(r.observe(6900, 100, "ready")).toBe(false);
  });
});

describe("P4A.2 tick reference maths", () => {
  it("derives deviation in bps from a tick delta", () => {
    expect(tickDeviationBps(1000, 1000)).toBe(0);
    expect(tickDeviationBps(1100, 1000)).toBe(100);
    expect(tickDeviationBps(900, 1000)).toBe(99);
    // A 3600-tick collapse is a ~30% price move — exactly breaker territory.
    expect(tickDeviationBps(1000, 4600)).toBeGreaterThanOrEqual(BREAKER_DEVIATION_BPS);
    expect(ready(tickDeviationBps(1000, 4600)).mode).toBe("paused");
  });
});
