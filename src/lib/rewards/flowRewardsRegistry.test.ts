import { describe, expect, it } from "vitest";
import {
  BOT_MAINNET_CHAIN_ID,
  BOT_TESTNET_CHAIN_ID,
  FLOW_REWARDS_CHAINS,
  getFlowRewardsChainConfig,
  resolveFlowClaimReadiness,
} from "./flowRewardsRegistry";

describe("flow rewards registry", () => {
  it("returns no config for unsupported chains", () => {
    expect(getFlowRewardsChainConfig(1)).toBeNull();
    expect(getFlowRewardsChainConfig(null)).toBeNull();
    expect(resolveFlowClaimReadiness(97, true)).toMatchObject({ ready: false, reason: "unsupportedChain" });
  });

  it("keeps mainnet claims disabled in the V12.2C gate", () => {
    expect(getFlowRewardsChainConfig(BOT_MAINNET_CHAIN_ID)!.claimsEnabled).toBe(false);
    expect(FLOW_REWARDS_CHAINS.filter((c) => c.claimsEnabled).map((c) => c.chainId)).toEqual([
      BOT_TESTNET_CHAIN_ID,
    ]);
  });

  it("never lets mainnet inherit testnet addresses", () => {
    const mainnet = getFlowRewardsChainConfig(BOT_MAINNET_CHAIN_ID)!;
    const testnet = getFlowRewardsChainConfig(BOT_TESTNET_CHAIN_ID)!;
    expect(mainnet.token).toBeNull();
    expect(mainnet.distributor).toBeNull();
    expect(mainnet.chainId).not.toBe(testnet.chainId);
    expect(resolveFlowClaimReadiness(BOT_MAINNET_CHAIN_ID, true)).toMatchObject({
      ready: false,
      reason: "mainnetPromotionPending",
    });
  });

  it("marks funded + enabled testnet claims ready (V12.2C)", () => {
    expect(resolveFlowClaimReadiness(BOT_TESTNET_CHAIN_ID, true)).toMatchObject({ ready: true });
  });

  it("still fails closed when addresses exist but policy is unapproved", () => {
    expect(resolveFlowClaimReadiness(BOT_TESTNET_CHAIN_ID, false)).toMatchObject({
      ready: false,
      reason: "conversionPolicyNotApproved",
    });
  });
});
