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

describe("FLOW staking registry (V13 fail-closed)", () => {
  it("never resolves staking as live in the build gate", () => {
    const r = resolveFlowStakingReadiness(BOT_TESTNET_CHAIN_ID, true);
    expect(r.ready).toBe(false);
    if (!r.ready) expect(r.reason).toBe("vaultNotDeployed");
  });

  it("keeps mainnet unpromoted", () => {
    const r = resolveFlowStakingReadiness(BOT_MAINNET_CHAIN_ID, true);
    expect(r.ready).toBe(false);
    if (!r.ready) expect(r.reason).toBe("mainnetPromotionPending");
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
    expect(getFlowStakingChainConfig(BOT_MAINNET_CHAIN_ID)!.token).toBeNull();
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
