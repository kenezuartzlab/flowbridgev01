import { describe, expect, it } from "vitest";
import {
  FLOW_TOKEN_BOT_TESTNET,
  buildFlowStakingPolicyReport,
  type FlowStakingConfig,
} from "./flowStakingPolicy";
import stakingConfig from "../../../contracts/config/staking-bot-testnet.json";

const PATH = "contracts/config/staking-bot-testnet.json";

describe("FLOW staking owner-gated policy (V13)", () => {
  it("reflects the owner-approved testnet config (BOT Testnet 968 only)", () => {
    const report = buildFlowStakingPolicyReport(stakingConfig as FlowStakingConfig, PATH);
    expect(report.unapproved).not.toContain("vaultOwner");
    expect(report.unapproved).not.toContain("economics.rewardBudgetPerEpoch");
    expect(report.verdicts.find((v) => v.parameter === "vaultOwner")!.value).toBe(
      "0x628e237b73C5a37EF3968527563FA1a26b32BB97",
    );
  });

  it("approves the frozen FLOW token as principal", () => {
    const report = buildFlowStakingPolicyReport(stakingConfig as FlowStakingConfig, PATH);
    const token = report.verdicts.find((v) => v.parameter === "token")!;
    expect(token.status).toBe("APPROVED");
    expect(token.value).toBe(FLOW_TOKEN_BOT_TESTNET);
  });

  it("rejects any token other than the deployed FLOW token", () => {
    const report = buildFlowStakingPolicyReport(
      { ...(stakingConfig as FlowStakingConfig), token: "0x0000000000000000000000000000000000000001" },
      PATH,
    );
    expect(report.verdicts.find((v) => v.parameter === "token")!.status).toBe("UNAPPROVED");
    expect(report.deployReady).toBe(false);
  });

  it("leaves lock, penalty and max stake DISABLED rather than guessed", () => {
    const report = buildFlowStakingPolicyReport(stakingConfig as FlowStakingConfig, PATH);
    for (const p of [
      "economics.lockSeconds",
      "economics.earlyWithdrawPenaltyBps",
      "economics.maxStakePerWallet",
    ]) {
      expect(report.verdicts.find((v) => v.parameter === p)!.status).toBe("DISABLED");
    }
  });

  it("is not deploy-ready without an approved owner address", () => {
    const report = buildFlowStakingPolicyReport(
      { ...(stakingConfig as FlowStakingConfig), vaultOwner: null },
      PATH,
    );
    expect(report.deployReady).toBe(false);
    expect(report.unapproved).toContain("vaultOwner");
  });

  it("requires budget, duration and start time together for economics approval", () => {
    const report = buildFlowStakingPolicyReport(
      {
        ...(stakingConfig as FlowStakingConfig),
        vaultOwner: "0x628e237b73C5a37EF3968527563FA1a26b32BB97",
        economics: {
          minStake: "1000000000000000000",
          rewardBudgetPerEpoch: "1000000000000000000000",
          epochDurationSeconds: 604800,
          startTime: "1800000000",
        },
      },
      PATH,
    );
    expect(report.economicsApproved).toBe(true);
    expect(report.unapproved).toHaveLength(0);
  });
});
