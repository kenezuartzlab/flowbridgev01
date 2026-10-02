import { describe, expect, it } from "vitest";
import {
  getSqrtRatioAtTick, Q96, priceToSqrtPriceX96, validateRange, rangeStatus, fullRangeTicks,
  nearestUsableTick, liquidityForAmounts, amountsForLiquidity, applySlippage, tickToPrice, priceToTick, pairedAmount,
} from "./v3Math";
import { planAddV2, planRemoveV2, quoteV2, deadlineFrom, isExpired, lpShareBps } from "./v2Math";
import { validateCreatePool, reciprocalPrices, sortTokens } from "./createPool";
import { suggestRanges } from "./suggestedRange";
import { advance, operationStatus, phaseFromReceipt, KIND_LABEL } from "./lifecycle";
import { checkTokenForLiquidity, assertExactDelta } from "./tokenSafety";
import { assertVenue, getLiquidityVenues, CASWAP_CAPABILITY_MATRIX } from "./venues";

const A = { address: "0x1000000000000000000000000000000000000001", decimals: 18, symbol: "AAA" };
const B = { address: "0x2000000000000000000000000000000000000002", decimals: 6, symbol: "BBB" };
const TIERS = [500, 3000, 10000] as const;

describe("V3 TickMath", () => {
  it("tick 0 = 1.0 (Q96)", () => expect(getSqrtRatioAtTick(0)).toBe(Q96));
  it("matches Uniswap MIN/MAX sqrt ratios", () => {
    expect(getSqrtRatioAtTick(-887272)).toBe(4295128739n);
    expect(getSqrtRatioAtTick(887272)).toBe(1461446703485210103287273052203988822378723970342n);
  });
  it("rejects out-of-range ticks", () => expect(() => getSqrtRatioAtTick(887273)).toThrow());
  it("price <-> tick round-trip", () => {
    const t = priceToTick(2.5, 18, 18);
    expect(tickToPrice(t, 18, 18)).toBeCloseTo(2.5, 3);
  });
  it("sqrtPriceX96 from price 1 with equal decimals is Q96", () => expect(priceToSqrtPriceX96("1", 18, 18)).toBe(Q96));
});

describe("V3 range validation", () => {
  it("accepts aligned ticks", () => expect(validateRange(-600, 600, 60)).toEqual({ ok: true }));
  it("rejects misaligned ticks", () => expect(validateRange(-601, 600, 60).ok).toBe(false));
  it("rejects inverted range", () => expect(validateRange(600, -600, 60).ok).toBe(false));
  it("full range is aligned", () => {
    const r = fullRangeTicks(200);
    expect(Math.abs(r.tickLower % 200)).toBe(0);
    expect(validateRange(r.tickLower, r.tickUpper, 200).ok).toBe(true);
  });
  it("nearestUsableTick clamps", () => expect(nearestUsableTick(887272, 60)).toBe(887220));
});

describe("V3 in-range / out-of-range display", () => {
  it("classifies", () => {
    expect(rangeStatus(0, -60, 60, 1n)).toBe("in-range");
    expect(rangeStatus(-120, -60, 60, 1n)).toBe("below-range");
    expect(rangeStatus(60, -60, 60, 1n)).toBe("above-range");
    expect(rangeStatus(0, -60, 60, 0n)).toBe("closed");
  });
});

describe("V3 liquidity amounts (mint / increase / decrease)", () => {
  const sp = getSqrtRatioAtTick(0), sa = getSqrtRatioAtTick(-600), sb = getSqrtRatioAtTick(600);
  it("round-trips amounts within 1 wei", () => {
    const L = liquidityForAmounts(sp, sa, sb, 10n ** 18n, 10n ** 18n);
    const r = amountsForLiquidity(sp, sa, sb, L);
    expect(r.amount0 <= 10n ** 18n && r.amount1 <= 10n ** 18n).toBe(true);
    expect(10n ** 18n - r.amount0 < 10n ** 15n || 10n ** 18n - r.amount1 < 10n ** 15n).toBe(true);
  });
  it("below range needs only token0", () => {
    const r = amountsForLiquidity(getSqrtRatioAtTick(-1200), sa, sb, 10n ** 18n);
    expect(r.amount1).toBe(0n);
  });
  it("paired amount is 0 out of range", () => expect(pairedAmount(getSqrtRatioAtTick(1200), -600, 600, 10n ** 18n, 0)).toBe(0n));
  it("decrease half liquidity gives about half amounts", () => {
    const L = liquidityForAmounts(sp, sa, sb, 10n ** 18n, 10n ** 18n);
    const full = amountsForLiquidity(sp, sa, sb, L), half = amountsForLiquidity(sp, sa, sb, L / 2n);
    expect(Number(half.amount0) / Number(full.amount0)).toBeCloseTo(0.5, 5);
  });
  it("slippage minimums", () => {
    expect(applySlippage(10_000n, 50)).toBe(9_950n);
    expect(() => applySlippage(1n, -1)).toThrow();
  });
});

describe("Unsupported V3 fee tier", () => {
  it("0.01% is never accepted", () => {
    const r = validateCreatePool({ version: "v3", tokenA: A, tokenB: B, feeTier: 100, enabledFeeTiers: TIERS, existingPool: null, priceAinB: "1", priceConfirmed: true });
    expect(r).toEqual({ ok: false, reason: "Unsupported fee tier" });
  });
});

describe("BDEX V2 add liquidity", () => {
  const pool = { reserveA: 1_000n * 10n ** 18n, reserveB: 2_000n * 10n ** 6n, totalSupply: 1_000n * 10n ** 12n };
  it("quotes at the actual pool ratio", () => expect(quoteV2(10n ** 18n, pool.reserveA, pool.reserveB)).toBe(2n * 10n ** 6n));
  it("applies slippage to minimums", () => {
    const p = planAddV2(10n ** 18n, null, pool, 100, { a: 10n ** 19n, b: 10n ** 8n });
    expect(p.amountBDesired).toBe(2_000_000n);
    expect(p.amountAMin).toBe((10n ** 18n * 99n) / 100n);
    expect(p.shareBps).toBeGreaterThanOrEqual(9);
  });
  it("insufficient balance", () => expect(() => planAddV2(10n ** 18n, null, pool, 50, { a: 1n, b: 10n ** 8n })).toThrow("Insufficient balance"));
  it("nonexistent pair requires both amounts", () => expect(() => planAddV2(10n ** 18n, null, null, 50, { a: 10n ** 19n, b: 10n ** 9n })).toThrow());
  it("new pair: minimums equal desired", () => {
    const p = planAddV2(10n, 20n, null, 50, { a: 10n, b: 20n });
    expect(p.newPair && p.amountAMin === 10n && p.amountBMin === 20n).toBe(true);
  });
  it("empty pool cannot be quoted", () => expect(() => quoteV2(1n, 0n, 1n)).toThrow("Pool has no liquidity"));
});

describe("BDEX V2 remove liquidity", () => {
  const pool = { reserveA: 1_000n, reserveB: 4_000n, totalSupply: 2_000n };
  it("expected amounts + minimums", () => {
    const r = planRemoveV2(200n, { pct: 50 }, pool, 100);
    expect(r).toMatchObject({ liquidity: 100n, expectedA: 50n, expectedB: 200n, amountAMin: 49n, amountBMin: 198n });
  });
  it("custom amount above balance rejected", () => expect(() => planRemoveV2(10n, { amount: 11n }, pool, 50)).toThrow("Insufficient LP balance"));
  it("invalid percentage rejected", () => expect(() => planRemoveV2(10n, { pct: 0 }, pool, 50)).toThrow());
  it("LP share", () => expect(lpShareBps(200n, 2_000n)).toBe(1000));
});

describe("Deadlines", () => {
  it("expired deadline detected", () => {
    const d = deadlineFrom(1_000, 20);
    expect(isExpired(d, 1_000)).toBe(false);
    expect(isExpired(d, 1_000 + 20 * 60)).toBe(true);
  });
  it("rejects zero/huge windows", () => {
    expect(() => deadlineFrom(1, 0)).toThrow();
    expect(() => deadlineFrom(1, 600)).toThrow();
  });
});

describe("Create Pool", () => {
  const base = { version: "v3" as const, tokenA: A, tokenB: B, feeTier: 3000, enabledFeeTiers: TIERS, existingPool: null, priceAinB: "2", priceConfirmed: true };
  it("duplicate rejected", () => expect(validateCreatePool({ ...base, existingPool: "0x3000000000000000000000000000000000000003" }).ok).toBe(false));
  it("same token rejected", () => expect(validateCreatePool({ ...base, tokenB: A }).ok).toBe(false));
  it("invalid address rejected", () => expect(validateCreatePool({ ...base, tokenB: { ...B, address: "0x12" } }).ok).toBe(false));
  it("invalid price rejected", () => {
    for (const p of ["0", "-1", "abc", ""]) expect(validateCreatePool({ ...base, priceAinB: p }).ok).toBe(false);
  });
  it("requires explicit reciprocal-price confirmation", () => {
    const r = validateCreatePool({ ...base, priceConfirmed: false });
    expect(r.ok).toBe(false);
  });
  it("shows both directions", () => expect(reciprocalPrices("4")).toEqual({ aInB: 4, bInA: 0.25 }));
  it("sorts tokens and encodes price as token1/token0", () => {
    const r = validateCreatePool(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.token0.address).toBe(A.address);
      expect(r.sqrtPriceX96).toBe(priceToSqrtPriceX96("2", 18, 6));
    }
    const [t0, , flipped] = sortTokens(B, A);
    expect(t0).toBe(A);
    expect(flipped).toBe(true);
  });
  it("V2 does not need a fee tier", () => expect(validateCreatePool({ ...base, version: "v2", feeTier: undefined }).ok).toBe(true));
});

describe("AI Suggested range", () => {
  const snap = { exists: true, liquidity: 10n ** 18n, sqrtPriceX96: Q96, tick: 0, tickSpacing: 60, dec0: 18, dec1: 18 };
  it("fails closed without real pool data", () => {
    expect(suggestRanges(null)).toBeNull();
    expect(suggestRanges({ ...snap, liquidity: 0n })).toBeNull();
    expect(suggestRanges({ ...snap, exists: false })).toBeNull();
  });
  it("profiles are aligned, contain the price, narrower = more concentrated", () => {
    const r = suggestRanges(snap)!;
    expect(r.map((x) => x.profile)).toEqual(["wide", "balanced", "narrow"]);
    for (const x of r) {
      expect(Math.abs(x.tickLower % 60)).toBe(0);
      expect(x.tickLower < 0 && x.tickUpper > 0).toBe(true);
      expect(x.notes.join(" ")).not.toMatch(/guaranteed profit|will earn/i);
    }
    expect(r[2].concentration).toBeGreaterThan(r[0].concentration);
  });
});

describe("Lifecycle + Activity", () => {
  it("never confirms on a hash alone", () => {
    expect(() => advance("confirming", "confirmed")).toThrow();
    expect(() => advance("confirming", "confirmed", { status: "reverted" })).toThrow();
    expect(advance("confirming", "confirmed", { status: "success" })).toBe("confirmed");
    expect(() => advance("submitted", "confirmed", { status: "success" })).toThrow();
  });
  it("failed tx maps to failed", () => {
    expect(phaseFromReceipt({ status: "reverted" })).toBe("failed");
    expect(phaseFromReceipt(null)).toBe("confirming");
  });
  it("grouped staged route keeps every hash and reports partial state", () => {
    const s = operationStatus({ txs: [
      { hash: "0x1", label: "1/3", phase: "confirmed" },
      { hash: "0x2", label: "2/3", phase: "confirmed" },
      { hash: "0x3", label: "3/3", phase: "submitted" },
    ] });
    expect(s).toEqual({ phase: "confirming", summary: "3 transactions · 2 confirmed · 1 waiting" });
    expect(operationStatus({ txs: [{ hash: "0x1", label: "1/2", phase: "confirmed" }, { hash: "0x2", label: "2/2", phase: "failed" }] }).phase).toBe("failed");
  });
  it("has a label for every liquidity action", () => {
    for (const k of ["routed-swap", "add-liquidity", "remove-liquidity", "create-pool", "increase-liquidity", "decrease-liquidity", "collect-fees"] as const) expect(KIND_LABEL[k]).toBeTruthy();
  });
});

describe("Token safety", () => {
  it("blocks unverified imported tokens", () => expect(checkTokenForLiquidity({ address: A.address, imported: true }, new Set()).ok).toBe(false));
  it("allows curated tokens", () => expect(checkTokenForLiquidity({ address: A.address, curated: true }, new Set()).ok).toBe(true));
  it("detects fee-on-transfer deltas", () => expect(() => assertExactDelta(100n, 0n, 99n, "Deposit")).toThrow(/unusual token accounting/));
});

describe("CaSwap independence", () => {
  it("never substitutes BDEX for CaSwap", () => {
    expect(() => assertVenue("caswap", "bdex-v2")).toThrow(/silent substitution/);
    expect(() => assertVenue("bdex-v3", "caswap")).toThrow();
    expect(() => assertVenue("caswap", "caswap")).not.toThrow();
  });
  it("CaSwap is its own venue with its own router on both chains", () => {
    for (const id of [677, 968]) {
      const v = getLiquidityVenues(id);
      const ca = v.find((x) => x.id === "caswap")!, b2 = v.find((x) => x.id === "bdex-v2")!;
      expect(ca.kind === "v2" && b2.kind === "v2" && ca.router.toLowerCase() !== b2.router.toLowerCase()).toBe(true);
      expect(ca.kind === "v2" && ca.wrappedGetter).toBe("WBOT");
    }
  });
  it("capability matrix records the audit", () => {
    expect(CASWAP_CAPABILITY_MATRIX.addLiquidity).toBe("SUPPORTED");
    expect(CASWAP_CAPABILITY_MATRIX.createPair).toBe("SUPPORTED");
  });
  it("unknown chain has no venues", () => expect(getLiquidityVenues(56)).toEqual([]));
});
