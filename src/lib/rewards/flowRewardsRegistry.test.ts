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

  it("keeps every chain undeployed and claims disabled in the V12 gate", () => {
    for (const c of FLOW_REWARDS_CHAINS) {
      expect(c.token).toBeNull();
      expect(c.distributor).toBeNull();
      expect(c.claimsEnabled).toBe(false);
    }
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

  it("reports testnet as pending deployment", () => {
    expect(resolveFlowClaimReadiness(BOT_TESTNET_CHAIN_ID, true)).toMatchObject({
      ready: false,
      reason: "distributorNotDeployed",
    });
  });

  it("still fails closed when addresses exist but policy is unapproved", () => {
    // simulate a post-deployment config
    const cfg = { ...getFlowRewardsChainConfig(BOT_TESTNET_CHAIN_ID)! };
    expect(cfg.claimsEnabled).toBe(false);
    expect(resolveFlowClaimReadiness(BOT_TESTNET_CHAIN_ID, false)).toMatchObject({ ready: false });
  });
});
