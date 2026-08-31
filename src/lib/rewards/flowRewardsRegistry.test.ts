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

  it("never lets mainnet inherit testnet addresses (V30.2B canonical only)", () => {
    const mainnet = getFlowRewardsChainConfig(BOT_MAINNET_CHAIN_ID)!;
    const testnet = getFlowRewardsChainConfig(BOT_TESTNET_CHAIN_ID)!;
    expect(mainnet.token).toBe("0xcaaB50F36252a57529AFeF651fa6B9f9281917fF");
    expect(mainnet.distributor).toBe("0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922");
    expect(mainnet.token).not.toBe(testnet.token);
    expect(mainnet.distributor).not.toBe(testnet.distributor);
    expect(mainnet.chainId).not.toBe(testnet.chainId);
    // Funded + verified, but claims remain disabled: no mainnet claim path.
    expect(resolveFlowClaimReadiness(BOT_MAINNET_CHAIN_ID, true)).toMatchObject({
      ready: false,
      reason: "claimsDisabled",
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
