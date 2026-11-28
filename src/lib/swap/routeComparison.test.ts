import { describe, expect, it } from "vitest";
import {
  ALTERNATIVE_CASWAP_ROUTER,
  EXTERNAL_DIRECTIONAL_FEE_CAP_BPS,
  assertRouteExecutable,
  evaluateRouteGates,
  routeFingerprint,
  selectBestExecutableRoute,
  type ComparedRoute,
} from "./routeComparison";

function route(patch: Partial<ComparedRoute> = {}): ComparedRoute {
  return {
    key: "bdex", venue: "BDEX V3", executionClass: "REGISTERED_EXECUTABLE", routerId: 0,
    router: "0x07032d47a1b9f8460cbee9dc17c1d3e438693929", factory: "0x1c51c173323ec11bb4e3c4fd2314c225dc4b5419",
    pool: "0x822dc160cc971510cf87999004a28b4a7aefd082", wrappedNative: "0xd5452816194a3784dba983426cce7c122f4abd30",
    caller: "0x79653140d84b78c19354ee984f236ec92160fc61", path: ["0xd5452816194a3784dba983426cce7c122f4abd30", "0x546307af427902a75771434df831d88219784e19"],
    amountIn: 100n, amountOut: 200n, gasUnits: 10n, gasPriceWei: 1n, gasCostInOutput: 10n, priceImpactBps: 20,
    externalDirectionalFeeBps: 0, feeMutable: false, registered: true, identityVerified: true, wrapperVerified: true,
    feeVerified: true, liquidityVerified: true, approvalVerified: true, block: 10, rejections: [], ...patch,
  };
}

describe("shared manual Swap / AutoTrade route comparison", () => {
  it("uses an explicit conservative 500 bps directional external-fee cap", () => {
    expect(EXTERNAL_DIRECTIONAL_FEE_CAP_BPS).toBe(500);
    expect(evaluateRouteGates(route({ externalDirectionalFeeBps: 500 })).rejections).not.toContain("EXTERNAL_FEE_CAP");
    expect(evaluateRouteGates(route({ externalDirectionalFeeBps: 501 })).rejections).toContain("EXTERNAL_FEE_CAP");
  });

  it("always disqualifies the observed 73% alternative CaSwap sell fee", () => {
    const r = evaluateRouteGates(route({ executionClass: "QUOTE_ONLY", router: ALTERNATIVE_CASWAP_ROUTER, externalDirectionalFeeBps: 7300 }));
    expect(r.rejections).toContain("EXTERNAL_FEE_CAP");
    expect(selectBestExecutableRoute([r])).toBeNull();
  });

  it("never lets a larger quote-only alternative become executable", () => {
    const best = selectBestExecutableRoute([route(), route({ key: "quote-only", executionClass: "QUOTE_ONLY", amountOut: 10000n })]);
    expect(best?.key).toBe("bdex");
  });

  it("chooses the best eligible route independently per leg using same-unit net output", () => {
    const best = selectBestExecutableRoute([route(), route({ key: "second", amountOut: 205n, gasCostInOutput: 1n })]);
    expect(best?.key).toBe("second");
  });

  it("rejects unregistered, unverified, mutable-fee and wrapper-mismatched executable routes", () => {
    for (const patch of [
      { registered: false }, { identityVerified: false }, { feeVerified: false }, { feeMutable: true }, { wrapperVerified: false },
    ]) expect(selectBestExecutableRoute([route(patch)])).toBeNull();
  });

  it("rejects disabled or zero-liquidity routes even when an output is supplied", () => {
    expect(selectBestExecutableRoute([route({ liquidityVerified: false })])).toBeNull();
    expect(selectBestExecutableRoute([route({ amountOut: 0n })])).toBeNull();
  });

  it("fails closed when gas consumes the complete native output", () => {
    expect(selectBestExecutableRoute([route({ gasCostInOutput: 200n })])).toBeNull();
  });

  it("binds the selected path, caller, amounts and block into the review fingerprint", () => {
    const f = routeFingerprint(route());
    expect(routeFingerprint(route())).toBe(f);
    expect(routeFingerprint(route({ block: 11 }))).not.toBe(f);
    expect(routeFingerprint(route({ path: [...route().path].reverse() }))).not.toBe(f);
  });

  it("throws instead of emitting calldata for a quote-only route", () => {
    expect(() => assertRouteExecutable(route({ executionClass: "QUOTE_ONLY" }))).toThrow("ROUTE_NOT_EXECUTABLE");
  });
});
