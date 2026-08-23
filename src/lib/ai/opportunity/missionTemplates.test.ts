import { describe, expect, it } from "vitest";
import {
  MISSION_TEMPLATE_VERSION,
  opportunityKind,
  opportunitySupportsMission,
  templateForOpportunity,
} from "./missionTemplates";

describe("V18 mission template registry", () => {
  it("only offers missions for supported typed opportunities", () => {
    expect(opportunitySupportsMission({ domain: "REWARDS", type: "CLAIM_FLOW" })).toBe(true);
    expect(opportunitySupportsMission({ domain: "STAKING", type: "START_STAKING" })).toBe(true);
    expect(opportunitySupportsMission({ domain: "CAMPAIGNS", type: "CAMPAIGN_TASKS" })).toBe(false);
    expect(opportunitySupportsMission({ domain: "WALLET", type: "BIND_WALLET" })).toBe(false);
  });

  it("compiles claim into claim-then-stake only when staking is available", () => {
    const withStake = templateForOpportunity({
      domain: "REWARDS",
      type: "CLAIM_FLOW",
      stakingAvailable: true,
    });
    expect(withStake?.id).toBe("CLAIM_THEN_STAKE");
    expect(withStake?.outcome).toBe("CLAIM_THEN_STAKE");
    expect(withStake?.stakePortionPercent).toBe(100);

    const claimOnly = templateForOpportunity({
      domain: "REWARDS",
      type: "CLAIM_FLOW",
      stakingAvailable: false,
    });
    expect(claimOnly?.id).toBe("CLAIM_FLOW");
    expect(claimOnly?.outcome).toBe("CLAIM_ONLY");
    expect(claimOnly?.stakePortionPercent).toBeNull();
  });

  it("never infers a stake amount from an opportunity", () => {
    const stake = templateForOpportunity({
      domain: "STAKING",
      type: "START_STAKING",
      stakingAvailable: true,
    });
    expect(stake?.id).toBe("STAKE_FLOW");
    expect(stake?.requiresUserInput).toEqual(["amount"]);
    expect(stake?.stakePortionPercent).toBeNull();
  });

  it("refuses unsupported opportunities instead of inventing a plan", () => {
    expect(
      templateForOpportunity({ domain: "TRADE", type: "SWAP_IDEA", stakingAvailable: true }),
    ).toBeNull();
  });

  it("stamps a stable template version and identity", () => {
    expect(opportunityKind({ domain: "rewards", type: "claim_flow" })).toBe("REWARDS:CLAIM_FLOW");
    expect(
      templateForOpportunity({ domain: "REWARDS", type: "CLAIM_FLOW", stakingAvailable: true })
        ?.version,
    ).toBe(MISSION_TEMPLATE_VERSION);
  });
});
