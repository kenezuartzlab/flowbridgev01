/**
 * FlowBridge V17.1B §10 — canonical reward-state cases.
 */
import { describe, expect, it } from "vitest";
import {
  conversionConfirmationCopy,
  missionPrerequisiteDecision,
  resolveRewardState,
  type RewardStateInput,
} from "./rewardStateTruth";

const base = (over: Partial<RewardStateInput> = {}): RewardStateInput => ({
  chainId: 968,
  observedAt: "2026-01-01T00:00:00.000Z",
  flowPointsTotal: 1006,
  eligibleFlowPoints: 1006,
  conversionMinimum: 1000,
  requirements: [
    { id: "EMAIL_VERIFIED", label: "Verified email", met: true },
    { id: "WALLET_BOUND", label: "Bound wallet", met: true },
    { id: "COMMUNITY_FOLLOWS", label: "Community channels followed", met: true },
  ],
  claimableFlowRaw: 0,
  claimedFlow: 0,
  walletFlow: 0,
  campaignPts: 50,
  conversionPolicyApproved: true,
  ...over,
});

describe("V17.1B canonical reward state", () => {
  it("case 1: points but zero on-chain claimable → conversion is the next step", () => {
    const s = resolveRewardState(base());
    expect(s.convertibleFlowPoints).toBe(1006);
    expect(s.claimableFlow).toBe(0);
    expect(s.nextEconomicStep).toBe("CONVERT_FLOW_POINTS");
    expect(s.reasonCodes).toContain("CONVERSION_REQUIRED");
    expect(s.copy.readiness).toBe("1,006 ready to convert");
    const d = missionPrerequisiteDecision(s);
    expect(d.insertConversion).toBe(true);
    expect(d.blocked).toBe(false);
  });

  it("case 2: after conversion the claim becomes the next step", () => {
    const s = resolveRewardState(base({ eligibleFlowPoints: 0, claimableFlowRaw: 1006 }));
    expect(s.nextEconomicStep).toBe("CLAIM_FLOW");
    expect(s.copy.readiness).toBe("1,006 FLOW ready to claim");
    expect(missionPrerequisiteDecision(s).claimReady).toBe(true);
  });

  it("case 3: nothing convertible and nothing claimable → blocked, no invented amount", () => {
    const s = resolveRewardState(base({ flowPointsTotal: 0, eligibleFlowPoints: 0 }));
    expect(s.nextEconomicStep).toBe("NONE");
    expect(s.reasonCodes).toContain("NO_CONVERTIBLE_OR_CLAIMABLE_FLOW");
    const d = missionPrerequisiteDecision(s);
    expect(d.blocked).toBe(true);
    expect(d.reasonCode).toBe("NO_CONVERTIBLE_OR_CLAIMABLE_FLOW");
  });

  it("case 4: both stages positive → claim the current entitlement first, never aggregated", () => {
    const s = resolveRewardState(base({ eligibleFlowPoints: 500, claimableFlowRaw: 1006 }));
    expect(s.nextEconomicStep).toBe("CLAIM_FLOW");
    expect(s.claimableFlow).toBe(1006);
    expect(s.convertibleFlowPoints).toBe(500);
    expect(s.claimableFlow! + s.convertibleFlowPoints).not.toBe(s.claimableFlow);
  });

  it("case 5: campaign PTS never enter FLOW stages", () => {
    const s = resolveRewardState(base({ campaignPts: 100_000 }));
    expect(s.campaignPts).toBe(100_000);
    expect(s.convertibleFlowPoints).toBe(1006);
    expect(s.flowPointsTotal).toBe(1006);
    expect(s.claimableFlow).toBe(0);
  });

  it("case 6: unmet requirements block conversion but still explain it", () => {
    const s = resolveRewardState(
      base({
        requirements: [
          { id: "EMAIL_VERIFIED", label: "Verified email", met: false },
          { id: "WALLET_BOUND", label: "Bound wallet", met: true },
        ],
      }),
    );
    expect(s.requirementsMet).toBe(false);
    expect(s.nextEconomicStep).toBe("NONE");
    expect(s.reasonCodes).toContain("CONVERSION_REQUIREMENTS_UNMET");
    expect(missionPrerequisiteDecision(s).blocked).toBe(true);
  });

  it("case 7: below the conversion minimum is not offered", () => {
    const s = resolveRewardState(base({ eligibleFlowPoints: 120 }));
    expect(s.nextEconomicStep).toBe("NONE");
    expect(s.reasonCodes).toContain("BELOW_CONVERSION_MINIMUM");
  });

  it("case 8: unreadable chain state fails closed with null, never zero", () => {
    const s = resolveRewardState(base({ claimableFlowRaw: null }));
    expect(s.claimableFlow).toBeNull();
    expect(s.provenance).toBe("DEGRADED");
    expect(s.freshness).toBe("UNAVAILABLE");
    expect(s.nextEconomicStep).toBe("NONE");
    expect(s.reasonCodes).toContain("CHAIN_STATE_UNAVAILABLE");
  });

  it("case 9: an unapproved conversion policy offers nothing", () => {
    const s = resolveRewardState(base({ conversionPolicyApproved: false, chainId: 677 }));
    expect(s.nextEconomicStep).toBe("NONE");
    expect(s.reasonCodes).toContain("CONVERSION_POLICY_NOT_APPROVED");
  });

  it("case 10: confirmation copy authorizes only the conversion", () => {
    const s = resolveRewardState(base());
    const c = conversionConfirmationCopy(s);
    expect(c.amount).toBe(1006);
    expect(c.title).toContain("1,006");
    expect(c.body).toMatch(/only the conversion/i);
    expect(c.body).toMatch(/Campaign PTS/);
  });

  it("an unreadable ledger degrades instead of guessing", () => {
    const s = resolveRewardState(base({ ledgerAvailable: false }));
    expect(s.reasonCodes).toContain("REWARD_STATE_UNAVAILABLE");
    expect(s.nextEconomicStep).toBe("NONE");
  });
});
