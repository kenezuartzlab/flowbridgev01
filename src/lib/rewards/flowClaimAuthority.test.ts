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
  readChainState: vi.fn(async () => ({
    alreadyClaimed: 0n,
    distributorBalance: 10_000_000n * 10n ** 18n,
  })),
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

  it("never signs on mainnet — mainnet uses the epoch distributor (V30.2B P2E)", async () => {
    const d = deps({ conversionPolicyApproved: true });
    const res = await authorizeFlowTokenClaim({
      userId: "u1",
      emailVerified: true,
      chainId: BOT_MAINNET_CHAIN_ID,
      deps: d,
    });
    expect(res).toMatchObject({ authorized: false, reason: "modelNotCanonicalForChain" });
    expect(d.signTypedData).not.toHaveBeenCalled();
  });

  it("authorizes funded testnet claims with a cumulative entitlement (V12.2C)", async () => {
    const d = deps({ conversionPolicyApproved: true });
    const res = await authorizeFlowTokenClaim({
      userId: "u1",
      emailVerified: true,
      chainId: BOT_TESTNET_CHAIN_ID,
      deps: d,
    });
    expect(res).toMatchObject({ authorized: true, chainId: BOT_TESTNET_CHAIN_ID });
    if (res.authorized) {
      // 4000 lifetime claimed points → 4000 FLOW, cumulative. Campaign PTS excluded.
      expect(res.cumulativeEntitlement).toBe((4000n * 10n ** 18n).toString());
      expect(res.account).toBe(incentives.walletAddress);
      expect(res.display.flowPoints).toBe(1200);
      expect(res.alreadyClaimed).toBe("0");
      expect(res.claimableDelta).toBe((4000n * 10n ** 18n).toString());
    }
    expect(d.signTypedData).toHaveBeenCalledTimes(1);
  });

  it("refuses a second positive authorization once the delta is settled on-chain (V12.3)", async () => {
    const d = deps({
      conversionPolicyApproved: true,
      readChainState: vi.fn(async () => ({
        alreadyClaimed: 4000n * 10n ** 18n,
        distributorBalance: 10_000_000n * 10n ** 18n,
      })),
    });
    const res = await authorizeFlowTokenClaim({
      userId: "u1",
      emailVerified: true,
      chainId: BOT_TESTNET_CHAIN_ID,
      deps: d,
    });
    expect(res).toMatchObject({ authorized: false, reason: "nothingToClaim", claimableDelta: "0" });
    expect(d.signTypedData).not.toHaveBeenCalled();
  });

  it("never signs when the distributor cannot cover the delta", async () => {
    const d = deps({
      conversionPolicyApproved: true,
      readChainState: vi.fn(async () => ({ alreadyClaimed: 0n, distributorBalance: 1n })),
    });
    const res = await authorizeFlowTokenClaim({
      userId: "u1",
      emailVerified: true,
      chainId: BOT_TESTNET_CHAIN_ID,
      deps: d,
    });
    expect(res).toMatchObject({ authorized: false, reason: "distributorUnderfunded" });
    expect(d.signTypedData).not.toHaveBeenCalled();
  });

  it("fails closed when chain state cannot be read", async () => {
    const d = deps({
      conversionPolicyApproved: true,
      readChainState: vi.fn(async () => {
        throw new Error("rpc down");
      }),
    });
    const res = await authorizeFlowTokenClaim({
      userId: "u1",
      emailVerified: true,
      chainId: BOT_TESTNET_CHAIN_ID,
      deps: d,
    });
    expect(res).toMatchObject({ authorized: false, reason: "chainStateUnavailable" });
    expect(d.signTypedData).not.toHaveBeenCalled();
  });

  it("blocks testnet when the conversion policy is unapproved, but still returns display data", async () => {
    const d = deps({ conversionPolicyApproved: false });
    const res = await authorizeFlowTokenClaim({
      userId: "u1",
      emailVerified: true,
      chainId: BOT_TESTNET_CHAIN_ID,
      deps: d,
    });
    expect(res).toMatchObject({ authorized: false, reason: "conversionPolicyNotApproved" });
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
