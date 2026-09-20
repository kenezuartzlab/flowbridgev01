import { describe, expect, it } from "vitest";
import { BDEX_V3_FEE_TIERS, sqrtPriceImpactBps } from "./quoter";
import { getCuratedTokens } from "./tokenRegistry";
import { MAINNET_CONTRACTS } from "../contracts";

describe("BDEX V3 route discovery policy", () => {
  it("enumerates the live 1% tier without accepting arbitrary fees", () => {
    expect(BDEX_V3_FEE_TIERS).toContain(10000);
    expect(BDEX_V3_FEE_TIERS).not.toContain(7500);
  });

  it("publishes canonical FLOW only in the Mainnet token selector", () => {
    const flow = getCuratedTokens(true).find((token) => token.symbol === "FLOW");
    expect(flow?.address).toBe(MAINNET_CONTRACTS.flowToken.toLowerCase());
    expect(flow?.decimals).toBe(18);
    expect(getCuratedTokens(false).some((token) => token.symbol === "FLOW")).toBe(false);
  });

  it("derives price impact from the quoted post-swap pool price", () => {
    expect(sqrtPriceImpactBps(1000n, 990n)).toBe(199);
    expect(sqrtPriceImpactBps(1000n, 1000n)).toBe(0);
    expect(sqrtPriceImpactBps(0n, 1000n)).toBe(0);
  });

  it("pins the verified production BDEX V3 contracts", () => {
    expect(MAINNET_CONTRACTS.bdexV3Factory.toLowerCase()).toBe("0x1c51c173323ec11bb4e3c4fd2314c225dc4b5419");
    expect(MAINNET_CONTRACTS.bdexV3Router.toLowerCase()).toBe("0x07032d47a1b9f8460cbee9dc17c1d3e438693929");
    expect(MAINNET_CONTRACTS.bdexV3Quoter.toLowerCase()).toBe("0x034a705b36067cff99abf5c662be881cbd8d0176");
  });
});