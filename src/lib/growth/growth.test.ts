/**
 * FlowBridge V27 §13/§15 — economic-inertness and truthfulness tests for the
 * guided-growth layer: onboarding, Ways to Earn, the staking calculator and the
 * notification centre.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_CAPABILITY_CHOICES,
  ONBOARDING_AUTHORITY,
  ONBOARDING_CAPABILITIES,
  ONBOARDING_STEPS,
  nextOnboardingStepId,
  onboardingPercent,
} from "./onboarding";
import { EARN_PATHS, EARN_PATHS_AUTHORITY, REWARD_STAGES } from "./earnPaths";
import { computeStakingEstimate } from "./stakingCalculator";
import {
  EMPTY_NOTIFICATION_PRESENTATION,
  NOTIFICATION_AUTHORITY,
  deriveNotifications,
  visibleNotifications,
  type NotificationPresentation,
} from "./notifications";
import type { RewardState } from "@/lib/rewards/rewardStateTruth";
import type { DecisionResult } from "@/lib/ai/decision/decisionTypes";

describe("V27 onboarding", () => {
  it("is economically inert and shows at most three capability choices", () => {
    expect(ONBOARDING_AUTHORITY.createsMission).toBe(false);
    expect(ONBOARDING_AUTHORITY.createsActionIntent).toBe(false);
    expect(ONBOARDING_AUTHORITY.signsTransaction).toBe(false);
    expect(ONBOARDING_CAPABILITIES.length).toBeLessThanOrEqual(MAX_CAPABILITY_CHOICES);
  });

  it("runs the five briefed steps in order and terminates", () => {
    expect(ONBOARDING_STEPS.map((s) => s.id)).toEqual([
      "WELCOME",
      "EXPLORE",
      "EARN",
      "SUPPORT_BOT_CHAIN",
      "PERSONALIZE",
    ]);
    expect(nextOnboardingStepId("PERSONALIZE")).toBeNull();
    expect(onboardingPercent("WELCOME")).toBe(20);
    expect(onboardingPercent("PERSONALIZE")).toBe(100);
  });

  it("never promises earnings or quotes a number", () => {
    for (const step of ONBOARDING_STEPS) {
      const text = [step.title, step.message, ...step.points].join(" ").toLowerCase();
      expect(text).not.toMatch(/guaranteed|earn up to|risk-free|apy of/);
    }
  });
});

describe("V27 Ways to Earn", () => {
  it("answers all six questions for every path", () => {
    for (const p of EARN_PATHS) {
      expect(p.what.length).toBeGreaterThan(10);
      expect(p.how.length).toBeGreaterThan(0);
      expect(p.rules.length).toBeGreaterThan(0);
      expect(p.couldChange.length).toBeGreaterThan(0);
      expect(p.confirm.length).toBeGreaterThan(10);
      expect(typeof p.whyBotChain === "string" || p.whyBotChain === null).toBe(true);
    }
  });

  it("keeps FLOW Points and Campaign PTS separate and never guarantees earnings", () => {
    const points = EARN_PATHS.find((p) => p.id === "FLOW_POINTS")!;
    expect(points.rules.join(" ")).toMatch(/Campaign PTS are a separate/i);
    const campaigns = EARN_PATHS.find((p) => p.id === "CAMPAIGNS")!;
    expect(campaigns.rules.join(" ")).toMatch(/never convert/i);
    const all = EARN_PATHS.flatMap((p) => [p.summary, p.what, ...p.how, ...p.rules]).join(" ");
    expect(all.toLowerCase()).not.toMatch(/earn up to|guaranteed return|risk-free/);
    expect(EARN_PATHS_AUTHORITY.guaranteesEarnings).toBe(false);
  });

  it("documents the canonical reward ladder in order", () => {
    expect(REWARD_STAGES.map((s) => s.id)).toEqual([
      "FLOW_POINTS",
      "READY_TO_CONVERT",
      "CLAIMABLE_FLOW",
      "CLAIMED_FLOW",
      "WALLET_FLOW",
    ]);
  });
});

describe("V27 staking calculator", () => {
  const base = {
    amountFlow: 500,
    days: 30,
    rewardFlowPerSecond: 100_000 / 2_592_000,
    totalStakedFlow: 4_500,
    minStakeFlow: 10,
    scheduleSecondsRemaining: 2_592_000,
    rewardInventoryFlow: 100_000,
  };

  it("computes amount + published rate + time deterministically", () => {
    const r = computeStakingEstimate(base);
    // share = 500 / 5000 = 10% of a 100,000 FLOW / 30-day schedule.
    expect(r.shareOfVault).toBeCloseTo(0.1, 6);
    expect(r.estimatedRewardFlow).toBeCloseTo(10_000, 3);
    expect(r.label).toBe("PREVIEW");
    expect(r.guaranteed).toBe(false);
    expect(r.createsActionIntent).toBe(false);
    expect(r.formula).toMatch(/estimated reward/i);
    expect(r.assumptions.length).toBeGreaterThan(0);
    expect(r.limits.join(" ")).toMatch(/not income and not a guarantee/i);
  });

  it("returns null instead of a guess when the published rate is unreadable", () => {
    const r = computeStakingEstimate({ ...base, rewardFlowPerSecond: null });
    expect(r.estimatedRewardFlow).toBeNull();
    expect(r.blockers).toContain("RATE_UNAVAILABLE");
  });

  it("clamps to the funded schedule and flags below-minimum amounts", () => {
    const clamped = computeStakingEstimate({ ...base, days: 90 });
    expect(clamped.effectiveDays).toBeCloseTo(30, 6);
    const small = computeStakingEstimate({ ...base, amountFlow: 1 });
    expect(small.blockers).toContain("BELOW_MINIMUM");
  });

  it("never exceeds the funded reward inventory", () => {
    const r = computeStakingEstimate({
      ...base,
      amountFlow: 1_000_000,
      rewardInventoryFlow: 100,
    });
    expect(r.estimatedRewardFlow!).toBeLessThanOrEqual(100);
  });
});

function rewardState(overrides: Partial<RewardState>): RewardState {
  return {
    schemaVersion: "flowbridge.rewardstate/1",
    policyVersion: "V17.1B",
    chainId: 968,
    observedAt: new Date().toISOString(),
    freshness: "REALTIME",
    provenance: "LIVE",
    flowPointsTotal: 1000,
    convertibleFlowPoints: 0,
    claimableFlow: 0,
    claimedFlow: 0,
    walletFlow: 0,
    campaignPts: 42,
    conversionMinimum: 100,
    requirements: [],
    requirementsMet: true,
    nextEconomicStep: "NONE",
    reasonCodes: [],
    copy: { stageLabel: "FLOW Points", readiness: "", nextAction: "" },
    ...overrides,
  } as RewardState;
}

const emptyDecision: DecisionResult = {
  schemaVersion: "flowbridge.decision/1",
  policyVersion: "V22",
  requestId: "r1",
  actorScopes: [],
  generatedAt: new Date().toISOString(),
  evidenceFreshness: [],
  items: [],
  suppressed: [],
  memoryUsed: false,
  preferenceKeysUsed: [],
  activeMissionIds: [],
  completedMissionCount: 0,
  degradedDomains: [],
  status: "OK",
  notice: null,
  executed: false,
  createdActionIntent: false,
  missionsCreated: 0,
};

describe("V27 notifications", () => {
  it("stays silent for a signed-out visitor", () => {
    expect(
      deriveNotifications({ signedIn: false, rewardState: rewardState({}), decision: emptyDecision }),
    ).toEqual([]);
  });

  it("derives claim readiness from canonical reward state only", () => {
    const items = deriveNotifications({
      signedIn: true,
      rewardState: rewardState({ nextEconomicStep: "CLAIM_FLOW", claimableFlow: 500 }),
      decision: emptyDecision,
    });
    const claim = items.find((n) => n.kind === "FLOW_READY_TO_CLAIM")!;
    expect(claim.href).toBe("/rewards");
    expect(claim.performsAction).toBe(false);
    expect(claim.createsMission).toBe(false);
    expect(claim.category).toBe("ACCOUNT");
  });

  it("never duplicates on repeated derivation (remount safety)", () => {
    const input = {
      signedIn: true,
      rewardState: rewardState({ nextEconomicStep: "CONVERT_FLOW_POINTS", convertibleFlowPoints: 1006 }),
      decision: emptyDecision,
    };
    const a = deriveNotifications(input).map((n) => n.id);
    const b = deriveNotifications(input).map((n) => n.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });

  it("respects dismiss, snooze, cooldown and the growth preference", () => {
    const items = deriveNotifications({
      signedIn: true,
      rewardState: rewardState({ nextEconomicStep: "CLAIM_FLOW", claimableFlow: 5 }),
      decision: emptyDecision,
    });
    const id = items[0]!.id;
    const now = 1_000_000_000_000;

    expect(visibleNotifications(items, { ...EMPTY_NOTIFICATION_PRESENTATION, dismissed: [id] }, now)).toEqual([]);
    expect(
      visibleNotifications(
        items,
        { ...EMPTY_NOTIFICATION_PRESENTATION, snoozedUntil: { [id]: now + 1000 } },
        now,
      ),
    ).toEqual([]);

    const readAndShown: NotificationPresentation = {
      ...EMPTY_NOTIFICATION_PRESENTATION,
      readIds: [id],
      lastShownAt: { [id]: now - 1000 },
    };
    expect(visibleNotifications(items, readAndShown, now)).toEqual([]);

    expect(NOTIFICATION_AUTHORITY.signsTransaction).toBe(false);
    expect(NOTIFICATION_AUTHORITY.createsActionIntent).toBe(false);
  });

  it("uses no fear or scarcity language", () => {
    const items = deriveNotifications({
      signedIn: true,
      rewardState: rewardState({ nextEconomicStep: "CLAIM_FLOW", claimableFlow: 5 }),
      decision: { ...emptyDecision, completedMissionCount: 2 },
    });
    for (const n of items) {
      const text = `${n.title} ${n.body}`.toLowerCase();
      expect(text).not.toMatch(/hurry|last chance|expires in|don't miss|act now|only \d+ left/);
    }
  });
});
