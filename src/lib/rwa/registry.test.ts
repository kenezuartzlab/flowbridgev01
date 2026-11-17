import { describe, expect, it } from "vitest";
import { RWA_REGISTRY, SOURCES, REVIEWED_AT, ONDO_PROHIBITED, ONDO_RESTRICTED, availability, explorerUrl, sourceUrl, discoveryPreviewAllowed, RWA_TRADING_ENABLED } from "./registry";
import { planExecution, NATIVE_V3_MULTI_CANDIDATE } from "../swap/executionCapability";
import type { SwapStep } from "../swap/quoter";

describe("BNB RWA discovery gates", () => {
  it("admits exactly the owner-specified issuer-confirmed BNB XAUt identity", () => {
    const admitted = RWA_REGISTRY.filter(a => a.contract);
    expect(admitted.map(a => [a.symbol, a.chainId, a.contract])).toEqual([["XAUt", 56, "0x21cAef8A43163Eea865baeE23b9C2E327696A3bf"]]);
    expect(admitted[0]?.identity).toBe("issuer-contract-confirmed");
  });
  it("never authorizes preview assets for buy, claim or approval", () => {
    expect(RWA_TRADING_ENABLED).toBe(false);
    for (const a of RWA_REGISTRY) expect(availability(a.id, 56)).toEqual({canBuy:false, canClaim:false, canApprove:false, state:a.kind === "securities-catalog" ? "legal-provider-hold" : "integration-hold"});
  });
  it("rejects all unauthorized networks and unknown assets", () => {
    for (const chain of [1, 97, 677, 968, 0, -1, NaN]) {
      expect(availability("xaut-bnb", chain).state).toBe("unsupported");
      expect(explorerUrl("xaut-bnb", chain)).toBeUndefined();
    }
    expect(availability("unknown", 56).state).toBe("unsupported");
  });
  it("never lets BNB use BOT V4, while preserving the vetted BOT route", () => {
    const steps = [{dex:"bdex-v3", inIsNative:true, outIsNative:false}, {dex:"bdex-v3", inIsNative:false, outIsNative:false}] as SwapStep[];
    expect(planExecution(steps, 56).execution).toBe("STAGED");
    expect(planExecution(steps, 56).v4Function).toBeUndefined();
    expect(56 in NATIVE_V3_MULTI_CANDIDATE).toBe(false);
    expect(planExecution(steps, 677).execution).toBe("ATOMIC_V4");
  });
  it("generates contract links only from trusted identity and chain", () => {
    expect(explorerUrl("xaut-bnb",56)).toBe("https://bscscan.com/token/0x21cAef8A43163Eea865baeE23b9C2E327696A3bf");
    for (const a of RWA_REGISTRY.filter(a => a.id !== "xaut-bnb")) expect(explorerUrl(a.id,56)).toBeUndefined();
    expect(explorerUrl("javascript:alert(1)",56)).toBeUndefined();
    expect(explorerUrl("0x1111111111111111111111111111111111111111",56)).toBeUndefined();
    expect(sourceUrl("__proto__" as keyof typeof SOURCES)).toBeUndefined();
  });
  it("keeps issuer legal identity, restrictions and rights separate from stock identity", () => {
    const stocks=RWA_REGISTRY.filter(a=>a.kind === "securities-catalog");
    expect(stocks.map(a=>a.id)).toEqual(["ondo-catalog","xstocks-catalog","bstocks-catalog"]);
    for(const a of stocks) {
      expect(a.eligibilityMode).toBe("provider-verification-required");
      expect(a.identity).toBe("catalog-only");
      expect(a.contract).toBeUndefined();
      expect(a.rights).toBe("issuer-defined-no-guarantee");
    }
    expect(ONDO_PROHIBITED).toContain("Canada");
    expect(ONDO_PROHIBITED).toContain("United States (including territories and U.S. persons)");
    expect(ONDO_RESTRICTED).toContain("Singapore");
  });
  it("requires dated first-party provenance for every record", () => {
    for(const a of RWA_REGISTRY) {
      expect(a.issuer.length).toBeGreaterThan(0);
      expect(a.evidence.length).toBeGreaterThan(0);
      for(const e of a.evidence) {
        expect(e.reviewedAt).toBe(REVIEWED_AT);
        expect(sourceUrl(e.source)).toBe(SOURCES[e.source]);
        expect(new URL(SOURCES[e.source]).protocol).toBe("https:");
      }
    }
  });
  it("has no personal location or investor data fields", () => {
    const forbidden = ["wallet", "email", "userId", "latitude", "longitude", "ipAddress", "countryOfResidence", "balance", "price", "quote"];
    for(const a of RWA_REGISTRY) for(const key of forbidden) expect(Object.hasOwn(a,key)).toBe(false);
  });
  it("does not open discovery in a published build", () => {
    expect(discoveryPreviewAllowed(false)).toBe(false);
    expect(discoveryPreviewAllowed(true)).toBe(true);
  });
});