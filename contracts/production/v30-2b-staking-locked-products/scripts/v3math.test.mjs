import { test, expect } from "bun:test";
import { getSqrtRatioAtTick, swapToTarget, scaleSqrt, amountsForLiquidity, MIN_SQRT, MAX_SQRT } from "./v3math.mjs";

const L = 10n ** 18n;
const ticks = [{ tick: -6000, liquidityNet: L }, { tick: 6000, liquidityNet: -L }];
const base = { sqrtP: getSqrtRatioAtTick(0), tick: 0, L, ticks, feePips: 10000 };

test("TickMath anchors match Uniswap constants", () => {
  expect(getSqrtRatioAtTick(0)).toBe(1n << 96n);
  expect(getSqrtRatioAtTick(-887272)).toBe(MIN_SQRT);
  expect(getSqrtRatioAtTick(887272)).toBe(MAX_SQRT);
});

for (const pct of [5, 10, 20, 30]) for (const dir of ["up", "down"]) {
  test(`${dir} ${pct}% move: fee = 1% of gross, lands on target inside range`, () => {
    const target = dir === "up" ? scaleSqrt(base.sqrtP, BigInt(100 + pct), 100n) : scaleSqrt(base.sqrtP, BigInt(100 - pct), 100n);
    const r = swapToTarget({ ...base, target });
    expect(r.endSqrt).toBe(target);
    expect(r.ticksCrossed).toBe(0);
    const feeRatio = Number(r.feePaid) / Number(r.amountInGross);
    expect(Math.abs(feeRatio - 0.01)).toBeLessThan(1e-9);
    expect(r.exhaustedLiquidity).toBe(false);
  });
}

test("fork reset independence: repeated runs from same baseline are identical and do not mutate state", () => {
  const snap = JSON.stringify(base, (k, v) => (typeof v === "bigint" ? v.toString() : v));
  const t = scaleSqrt(base.sqrtP, 130n, 100n);
  const a = swapToTarget({ ...base, target: t }), b = swapToTarget({ ...base, target: t });
  expect(a.amountInGross).toBe(b.amountInGross);
  expect(JSON.stringify(base, (k, v) => (typeof v === "bigint" ? v.toString() : v))).toBe(snap);
});

test("cost is superlinear in move size and linear in liquidity", () => {
  const c = (p, liq) => swapToTarget({ ...base, L: liq, ticks: [{ tick: -6000, liquidityNet: liq }, { tick: 6000, liquidityNet: -liq }], target: scaleSqrt(base.sqrtP, BigInt(100 + p), 100n) }).amountInGross;
  expect(c(30, L)).toBeGreaterThan(c(5, L) * 5n);
  const r = Number(c(30, 2n * L)) / Number(c(30, L));
  expect(Math.abs(r - 2)).toBeLessThan(1e-9);
});

test("range boundary: crossing upper tick exhausts liquidity (one-sided)", () => {
  const r = swapToTarget({ ...base, target: getSqrtRatioAtTick(9000) });
  expect(r.ticksCrossed).toBe(1);
  expect(r.endLiquidity).toBe(0n);
  expect(r.exhaustedLiquidity).toBe(true);
});

test("amountsForLiquidity is one-sided outside range", () => {
  const a = getSqrtRatioAtTick(-6000), b = getSqrtRatioAtTick(6000);
  expect(amountsForLiquidity(getSqrtRatioAtTick(-7000), a, b, L).amount1).toBe(0n);
  expect(amountsForLiquidity(getSqrtRatioAtTick(7000), a, b, L).amount0).toBe(0n);
});
