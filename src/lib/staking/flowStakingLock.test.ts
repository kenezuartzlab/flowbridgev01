import { describe, expect, it } from "vitest";
import {
  APPROVED_EMERGENCY_POLICY,
  IMMEDIATE_START_POLICY,
  MANDATORY_PARAMETERS,
  buildFlowStakingLockReport,
  type FlowStakingLockConfig,
} from "./flowStakingLock";
import { FLOW_TOKEN_BOT_TESTNET } from "./flowStakingPolicy";
import { FlowStakingVaultSim } from "./flowStakingVaultSim";
import config from "../../../contracts/config/staking-bot-testnet.json";

const OWNER = "0x0000000000000000000000000000000000000011";
const TREASURY = "0x0000000000000000000000000000000000000022";

const approved: FlowStakingLockConfig = {
  chainId: 968,
  token: FLOW_TOKEN_BOT_TESTNET,
  vaultOwner: OWNER,
  rewardTreasury: TREASURY,
  economics: {
    minStake: "1000000000000000000",
    rewardBudgetPerEpoch: "1000000000000000000000",
    epochDurationSeconds: 604800,
    startTime: IMMEDIATE_START_POLICY,
  },
  safety: { cooldownSeconds: null, emergencyWithdrawPolicy: APPROVED_EMERGENCY_POLICY },
};

describe("V13.1 staking parameter lock", () => {
  it("locks the shipped canonical testnet config with the owner-approved values", () => {
    const r = buildFlowStakingLockReport(config as FlowStakingLockConfig, "contracts/config/staking-bot-testnet.json");
    expect(r.parameterLockPass).toBe(true);
    expect(r.blocked).toEqual([]);
    expect(r.solvency.budget).toBe("100000000000000000000000");
    expect(r.solvency.durationSeconds).toBe("2592000");
    expect(BigInt(r.solvency.requiredInventory!)).toBeLessThanOrEqual(BigInt(r.solvency.budget!));
  });

  it("passes only when every mandatory decision is approved", () => {
    const r = buildFlowStakingLockReport(approved, "test");
    expect(r.blocked).toEqual([]);
    expect(r.parameterLockPass).toBe(true);
    expect(r.solvency.requiredInventory).not.toBeNull();
    expect(BigInt(r.solvency.requiredInventory!)).toBeLessThanOrEqual(BigInt(r.solvency.budget!));
  });

  it("rejects any emergency policy other than the always-withdrawable model", () => {
    for (const policy of ["pause-blocks-withdraw", "owner-recovery", "", null]) {
      const r = buildFlowStakingLockReport(
        { ...approved, safety: { emergencyWithdrawPolicy: policy as string } },
        "test",
      );
      expect(r.parameterLockPass).toBe(false);
      expect(r.blocked).toContain("safety.emergencyWithdrawPolicy");
    }
  });

  it("each mandatory parameter individually blocks the lock", () => {
    for (const p of MANDATORY_PARAMETERS) {
      const broken: FlowStakingLockConfig = JSON.parse(JSON.stringify(approved));
      if (p === "token") broken.token = null;
      else if (p === "vaultOwner") broken.vaultOwner = null;
      else if (p === "rewardTreasury") broken.rewardTreasury = null;
      else if (p === "safety.emergencyWithdrawPolicy") broken.safety = { emergencyWithdrawPolicy: null };
      else (broken.economics as Record<string, unknown>)[p.split(".")[1]!] = null;
      expect(buildFlowStakingLockReport(broken, "test").parameterLockPass).toBe(false);
    }
  });
});

describe("FlowStakingVault reference simulator", () => {
  const owner = OWNER;
  const A = "0x00000000000000000000000000000000000000a1";
  const B = "0x00000000000000000000000000000000000000b2";
  const budget = 604800n * 1000n; // exact-divisible budget
  const duration = 604800n;

  function fresh() {
    const sim = new FlowStakingVaultSim({ token: FLOW_TOKEN_BOT_TESTNET, owner, startTime: 1000n });
    sim.credit(TREASURY, budget);
    sim.credit(A, 1000n * 10n ** 18n);
    sim.credit(B, 1000n * 10n ** 18n);
    sim.fundRewards(TREASURY, budget);
    sim.activateSchedule(owner, budget, duration);
    return sim;
  }

  it("keeps principal and reward inventory separate and solvent", () => {
    const sim = fresh();
    sim.stake(A, 100n * 10n ** 18n);
    expect(sim.rewardInventory).toBe(budget);
    expect(sim.totalStaked).toBe(100n * 10n ** 18n);
    expect(sim.checkInvariants()).toEqual([]);
  });

  it("pays only pro-rata time-weighted rewards to a mid-schedule entrant", () => {
    const sim = fresh();
    sim.stake(A, 100n * 10n ** 18n);
    sim.warp(duration / 2n);
    sim.stake(B, 100n * 10n ** 18n);
    expect(sim.earned(B)).toBe(0n);
    sim.warp(duration / 2n);
    expect(sim.earned(A)).toBeGreaterThan(sim.earned(B));
    expect(sim.earned(A) + sim.earned(B)).toBeLessThanOrEqual(budget);
  });

  it("returns exact principal even while paused and never slashes", () => {
    const sim = fresh();
    sim.stake(A, 250n * 10n ** 18n);
    sim.warp(100n);
    sim.pause(owner);
    expect(() => sim.stake(A, 1n)).toThrow();
    expect(() => sim.claimReward(A)).toThrow();
    sim.withdraw(A, 250n * 10n ** 18n);
    expect(sim.balanceOf(A)).toBe(0n);
    expect(sim.walletOf(A)).toBe(1000n * 10n ** 18n);
    expect(sim.checkInvariants()).toEqual([]);
  });

  it("claim reduces reward inventory, never principal", () => {
    const sim = fresh();
    sim.stake(A, 100n * 10n ** 18n);
    sim.warp(duration / 4n);
    const before = { inv: sim.rewardInventory, principal: sim.totalStaked };
    const paid = sim.claimReward(A);
    expect(paid).toBeGreaterThan(0n);
    expect(sim.rewardInventory).toBe(before.inv - paid);
    expect(sim.totalStaked).toBe(before.principal);
  });

  it("stops accruing after the funded period and blocks owner principal recovery", () => {
    const sim = fresh();
    sim.stake(A, 100n * 10n ** 18n);
    sim.warp(duration * 2n);
    const settled = sim.earned(A);
    sim.warp(duration);
    expect(sim.earned(A)).toBe(settled);
    expect(() => sim.recoverUncommittedRewards(owner, TREASURY, 1n)).toThrow();
  });
});
