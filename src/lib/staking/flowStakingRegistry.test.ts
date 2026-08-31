import { describe, expect, it } from "vitest";
import {
  BOT_MAINNET_CHAIN_ID,
  BOT_TESTNET_CHAIN_ID,
  FLOW_STAKING_BLOCKED_COPY,
  describeRewardSchedule,
  getFlowStakingChainConfig,
  resolveFlowStakingReadiness,
} from "./flowStakingRegistry";
import { FLOW_TOKEN_BOT_TESTNET } from "./flowStakingPolicy";

describe("FLOW staking registry (V13.2 testnet live, mainnet fail-closed)", () => {
  it("resolves BOT Testnet as live only with a funded schedule", () => {
    const funded = resolveFlowStakingReadiness(BOT_TESTNET_CHAIN_ID, true);
    expect(funded.ready).toBe(true);
    const unfunded = resolveFlowStakingReadiness(BOT_TESTNET_CHAIN_ID, false);
    expect(unfunded.ready).toBe(false);
    if (!unfunded.ready) expect(unfunded.reason).toBe("scheduleNotFunded");
  });

  it("keeps mainnet staking inactive on the canonical V30.2B addresses", () => {
    const r = resolveFlowStakingReadiness(BOT_MAINNET_CHAIN_ID, true);
    expect(r.ready).toBe(false);
    if (!r.ready) expect(r.reason).toBe("stakingDisabled");
    const cfg = getFlowStakingChainConfig(BOT_MAINNET_CHAIN_ID)!;
    expect(cfg.vault).toBe("0x15e7B1b4b16a43E6CE2E1f460dBE4201E9B6790D");
    expect(cfg.stakingEnabled).toBe(false);
  });

  it("fails closed on unsupported chains", () => {
    for (const chain of [1, 56, null, undefined, NaN]) {
      const r = resolveFlowStakingReadiness(chain as number, true);
      expect(r.ready).toBe(false);
      if (!r.ready) expect(r.reason).toBe("unsupportedChain");
    }
  });

  it("binds testnet staking principal to the existing FLOW token", () => {
    expect(getFlowStakingChainConfig(BOT_TESTNET_CHAIN_ID)!.token).toBe(FLOW_TOKEN_BOT_TESTNET);
    expect(getFlowStakingChainConfig(BOT_MAINNET_CHAIN_ID)!.token).toBe(
      "0xcaaB50F36252a57529AFeF651fa6B9f9281917fF",
    );
  });

  it("has blocked copy that never implies a live yield", () => {
    for (const copy of Object.values(FLOW_STAKING_BLOCKED_COPY)) {
      expect(copy).not.toMatch(/APY|APR|%/i);
    }
  });

  it("returns no schedule description without authoritative on-chain state", () => {
    expect(
      describeRewardSchedule({
        rewardRatePerSecond: null,
        periodFinish: null,
        totalStaked: 0n,
        nowSeconds: 100n,
      }),
    ).toBeNull();
  });

  it("describes an active schedule only from real rate + finish time", () => {
    const inactive = describeRewardSchedule({
      rewardRatePerSecond: 5n,
      periodFinish: 100n,
      totalStaked: 10n,
      nowSeconds: 200n,
    })!;
    expect(inactive.active).toBe(false);
    expect(inactive.ratePerDay).toBe(0n);

    const active = describeRewardSchedule({
      rewardRatePerSecond: 5n,
      periodFinish: 1000n,
      totalStaked: 10n,
      nowSeconds: 400n,
    })!;
    expect(active.active).toBe(true);
    expect(active.remainingSeconds).toBe(600n);
    expect(active.ratePerDay).toBe(5n * 86400n);
  });
});
