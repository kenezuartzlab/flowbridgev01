import { describe, expect, it, vi } from "vitest";
import { authorizeFlowTokenClaim } from "./flowClaimAuthority.server";
import { cumulativeFlowEntitlement, isFlowConversionPolicyApproved } from "./flowConversionPolicy";
import { BOT_MAINNET_CHAIN_ID, BOT_TESTNET_CHAIN_ID } from "./flowRewardsRegistry";

const incentives = {
  flowPoints: 1200,
  claimableTotal: 1200,
  claimedTokens: 4000,
  walletAddress: "0x1111111111111111111111111111111111111111",
};

const deps = (over: Partial<any> = {}) => ({
  readIncentives: vi.fn(async () => incentives),
  signTypedData: vi.fn(async () => "0xdead" as `0x${string}`),
  now: () => 1_700_000_000_000,
  ...over,
});

describe("FLOW conversion policy", () => {
  it("is unapproved in the V12 gate, so no entitlement can be computed", () => {
    expect(isFlowConversionPolicyApproved()).toBe(false);
    expect(cumulativeFlowEntitlement(10_000)).toBeNull();
  });

  it("computes deterministically once a policy is supplied", () => {
    const policy = { flowWeiPerPoint: 10n ** 18n, approvedSpecRef: "spec-1" };
    expect(cumulativeFlowEntitlement(3, policy)).toBe(3n * 10n ** 18n);
    expect(cumulativeFlowEntitlement(3, policy)).toBe(cumulativeFlowEntitlement(3, policy));
  });
});

describe("authorizeFlowTokenClaim", () => {
  it("never signs on an unsupported chain", async () => {
    const d = deps();
    const res = await authorizeFlowTokenClaim({ userId: "u1", emailVerified: true, chainId: 1, deps: d });
    expect(res.authorized).toBe(false);
    expect(d.signTypedData).not.toHaveBeenCalled();
  });

  it("never signs on unpromoted mainnet", async () => {
    const d = deps({ conversionPolicyApproved: true });
    const res = await authorizeFlowTokenClaim({
      userId: "u1",
      emailVerified: true,
      chainId: BOT_MAINNET_CHAIN_ID,
      deps: d,
    });
    expect(res).toMatchObject({ authorized: false, reason: "mainnetPromotionPending" });
    expect(d.signTypedData).not.toHaveBeenCalled();
  });

  it("blocks testnet while claims are disabled, but still returns display data", async () => {
    const d = deps({ conversionPolicyApproved: true });
    const res = await authorizeFlowTokenClaim({
      userId: "u1",
      emailVerified: true,
      chainId: BOT_TESTNET_CHAIN_ID,
      deps: d,
    });
    expect(res).toMatchObject({ authorized: false, reason: "distributorNotDeployed" });
    if (!res.authorized) {
      expect(res.display.flowPoints).toBe(1200);
      expect(res.display.walletAddress).toBe(incentives.walletAddress);
    }
    expect(d.signTypedData).not.toHaveBeenCalled();
  });

  it("binds the claim to the profile wallet only (browser cannot choose one)", async () => {
    const d = deps({ readIncentives: vi.fn(async () => ({ ...incentives, walletAddress: null })) });
    const res = await authorizeFlowTokenClaim({
      userId: "u1",
      emailVerified: true,
      chainId: BOT_TESTNET_CHAIN_ID,
      deps: d,
    });
    expect(res.authorized).toBe(false);
    expect(d.signTypedData).not.toHaveBeenCalled();
  });

  it("is idempotent for unchanged reward state", async () => {
    const d = deps();
    const a = await authorizeFlowTokenClaim({ userId: "u1", emailVerified: true, chainId: BOT_TESTNET_CHAIN_ID, deps: d });
    const b = await authorizeFlowTokenClaim({ userId: "u1", emailVerified: true, chainId: BOT_TESTNET_CHAIN_ID, deps: d });
    expect(a).toEqual(b);
  });
});
