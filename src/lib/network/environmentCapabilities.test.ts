import { describe, expect, it } from "vitest";
import { assertFeatureAllowed, environmentOf, isFeatureAllowed } from "./environmentCapabilities";

describe("environment capabilities", () => {
  it("classifies networks", () => {
    expect(environmentOf(677)).toBe("mainnet");
    expect(environmentOf(56)).toBe("mainnet");
    expect(environmentOf(968)).toBe("testnet");
    expect(environmentOf(1024)).toBeNull();
  });
  it("testnet staking tools only run on BOT Testnet 968", () => {
    expect(isFeatureAllowed("TESTNET_STAKING_LIFECYCLE", 968)).toBe(true);
    expect(isFeatureAllowed("TESTNET_STAKING_LIFECYCLE", 677)).toBe(false);
  });
  it("mainnet staking never runs on testnet", () => {
    expect(isFeatureAllowed("MAINNET_STAKING", 968)).toBe(false);
    expect(isFeatureAllowed("MAINNET_STAKING", 677)).toBe(true);
  });
  it("claims reject unknown and non-BOT chains", () => {
    expect(() => assertFeatureAllowed("FLOW_TOKEN_CLAIM", 56)).toThrow();
    expect(() => assertFeatureAllowed("FLOW_TOKEN_CLAIM", null)).toThrow();
    expect(() => assertFeatureAllowed("FLOW_TOKEN_CLAIM", 677)).not.toThrow();
  });
  it("bridge stays available across BNB and Ethereum", () => {
    expect(isFeatureAllowed("BRIDGE", 56)).toBe(true);
    expect(isFeatureAllowed("BRIDGE", 1)).toBe(true);
  });
});
