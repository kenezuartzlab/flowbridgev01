/**
 * FlowBridge V26 §11 — deterministic acceptance states for guided journeys.
 *
 * These tests also prove the layer is economically inert: no journey may create
 * a mission or an ActionIntent, and skip/dismiss/snooze may only change what is
 * presented, never the canonical state behind it.
 */
import { describe, expect, it } from "vitest";
import type { DecisionItem, DecisionResult } from "../decision/decisionTypes";
import { JOURNEY_REGISTRY } from "./journeyRegistry";
import { buildJourneyContext, resolveJourney, selectJourneys } from "./journeyResolver";
import { ALLOWED_JOURNEY_DESTINATIONS, type JourneyContext } from "./journeyTypes";

function item(over: Partial<DecisionItem> = {}): DecisionItem {
  return {
    kind: "OPPORTUNITY",
    id: over.id ?? "opp-1",
    opportunityId: "opp-1",
    missionId: null,
    rank: 1,
    score: 10,
    scoreParts: [],
    reasonCodes: [],
    title: "Something",
    what: "what",
    whyNow: "why",
    whatNext: "next",
    requiresWalletConfirmation: false,
    actionable: true,
    blocked: false,
    blockerText: null,
    domain: "REWARDS",
    provenance: "LIVE",
    expiresAt: null,
    containsPrivateEvidence: false,
    freshness: "REALTIME",
    surface: { label: "Open rewards", href: "/rewards" },
    facts: [],
    evidenceRefs: [],
    supportsMission: true,
    ...over,
  } as DecisionItem;
}

function decision(over: Partial<DecisionResult> = {}): DecisionResult {
  return {
    schemaVersion: "flowbridge.decision/1",
    policyVersion: "V22",
    requestId: "req",
    actorScopes: ["AUTHENTICATED_USER"],
    generatedAt: new Date().toISOString(),
    evidenceFreshness: ["REALTIME"],
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
    ...over,
  } as DecisionResult;
}

const reward = (over: Record<string, unknown> = {}) => ({
  provenance: "LIVE",
  walletAddress: "0xabc",
  flowPointsTotal: 0,
  convertibleFlowPoints: 0,
  claimableFlow: 0,
  claimedFlow: 0,
  walletFlow: 0,
  campaignPts: 0,
  conversionMinimum: 1000,
  requirementsMet: true,
  nextEconomicStep: "NONE",
  ...over,
}) as any;

describe("V26 journey registry integrity", () => {
  it("only uses approved destinations and never claims authority", () => {
    const ctx: JourneyContext = buildJourneyContext({
      decision: decision(),
      rewardState: reward(),
      signedIn: true,
    });
    for (const def of JOURNEY_REGISTRY) {
      const r = resolveJourney(def, ctx);
      expect(ALLOWED_JOURNEY_DESTINATIONS).toContain(r.primaryCta.href);
      if (r.secondaryCta) expect(ALLOWED_JOURNEY_DESTINATIONS).toContain(r.secondaryCta.href);
      expect(r.createsMission).toBe(false);
      expect(r.createsActionIntent).toBe(false);
      expect(r.grantsAuthority).toBe(false);
      expect(r.stages.length).toBeGreaterThan(0);
    }
  });

  it("has unique journey ids", () => {
    const ids = JOURNEY_REGISTRY.map((j) => j.journeyId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("V26 §11 deterministic acceptance states", () => {
  it("new/public actor gets Discover FlowBridge with no private data", () => {
    const ctx = buildJourneyContext({ decision: null, rewardState: null, signedIn: false });
    const sel = selectJourneys({ ctx });
    expect(sel.primary?.journeyId).toBe("DISCOVER_FLOWBRIDGE");
    expect(ctx.flowPointsTotal).toBe(0);
    expect(ctx.claimableFlow).toBeNull();
    expect(ctx.walletBound).toBe(false);
  });

  it("authenticated actor with no history gets First useful action", () => {
    const ctx = buildJourneyContext({
      decision: decision(),
      rewardState: reward(),
      signedIn: true,
    });
    expect(selectJourneys({ ctx }).primary?.journeyId).toBe("FIRST_ACTION");
  });

  it("convertible points with zero claimable FLOW shows the conversion prerequisite", () => {
    const ctx = buildJourneyContext({
      decision: decision(),
      rewardState: reward({
        flowPointsTotal: 1200,
        convertibleFlowPoints: 1200,
        claimableFlow: 0,
        nextEconomicStep: "CONVERT_FLOW_POINTS",
      }),
      signedIn: true,
    });
    const j = selectJourneys({ ctx }).primary!;
    expect(j.journeyId).toBe("REWARDS_TO_FLOW");
    const convert = j.stages.find((s) => s.id === "convert")!;
    const claim = j.stages.find((s) => s.id === "claim")!;
    expect(convert.status).toBe("READY");
    expect(claim.status).toBe("EXPLORE");
    expect(j.currentStageId).toBe("convert");
  });

  it("unmet requirements block conversion honestly", () => {
    const ctx = buildJourneyContext({
      decision: decision(),
      rewardState: reward({
        flowPointsTotal: 1200,
        convertibleFlowPoints: 1200,
        requirementsMet: false,
        nextEconomicStep: "CONVERT_FLOW_POINTS",
      }),
      signedIn: true,
    });
    const j = selectJourneys({ ctx }).primary!;
    expect(j.stages.find((s) => s.id === "requirements")!.status).toBe("NEEDS_YOU");
    expect(j.currentStageId).toBe("requirements");
  });

  it("never mixes Campaign PTS into a FLOW stage", () => {
    const ctx = buildJourneyContext({
      decision: decision(),
      rewardState: reward({ campaignPts: 5000 }),
      signedIn: true,
    });
    expect(ctx.campaignPts).toBe(5000);
    expect(ctx.flowPointsTotal).toBe(0);
    expect(ctx.convertibleFlowPoints).toBe(0);
    expect(ctx.claimableFlow).toBe(0);
  });

  it("active mission dominates and removes duplicate journeys", () => {
    const mission = item({
      kind: "CONTINUE_MISSION",
      id: "mission:m1",
      missionId: "m1",
      requiresWalletConfirmation: true,
      domain: "STAKING",
    });
    const ctx = buildJourneyContext({
      decision: decision({ items: [mission], activeMissionIds: ["m1"] }),
      rewardState: reward({ walletFlow: 500, flowPointsTotal: 0 }),
      signedIn: true,
    });
    const sel = selectJourneys({ ctx });
    expect(sel.primary?.journeyId).toBe("CONTINUE_MISSION");
    expect(sel.primary?.currentStatus).toBe("NEEDS_YOU");
    // START_STAKING would duplicate the active workflow, so it is not eligible.
    expect(sel.secondary?.journeyId).not.toBe("START_STAKING");
  });

  it("completed mission shows the verified outcome with no execution controls", () => {
    const ctx = buildJourneyContext({
      decision: decision({ completedMissionCount: 1 }),
      rewardState: reward({ walletFlow: 0 }),
      signedIn: true,
    });
    const j = selectJourneys({ ctx }).primary!;
    expect(j.journeyId).toBe("MISSION_OUTCOME");
    expect(j.stages[0]!.status).toBe("COMPLETED");
    for (const dest of [j.primaryCta.href, j.secondaryCta?.href].filter(Boolean)) {
      expect(ALLOWED_JOURNEY_DESTINATIONS).toContain(dest as string);
    }
  });

  it("idle FLOW with no mission suggests staking without preparing anything", () => {
    const ctx = buildJourneyContext({
      decision: decision(),
      rewardState: reward({ walletFlow: 250 }),
      signedIn: true,
    });
    const j = selectJourneys({ ctx }).primary!;
    expect(j.journeyId).toBe("START_STAKING");
    expect(j.createsMission).toBe(false);
    expect(j.primaryCta.href).toBe("/stake");
  });
});

describe("V26 §7/§10 presentation-only dismissal", () => {
  it("dismissing a non-urgent journey changes presentation but not canonical state", () => {
    const rewardState = reward({ walletFlow: 250 });
    const ctx = buildJourneyContext({ decision: decision(), rewardState, signedIn: true });
    const before = selectJourneys({ ctx });
    const after = selectJourneys({
      ctx,
      presentation: { dismissed: ["START_STAKING"], skipped: [], snoozedUntil: {} },
    });
    expect(before.primary?.journeyId).toBe("START_STAKING");
    expect(after.primary?.journeyId).not.toBe("START_STAKING");
    expect(after.hiddenByUser).toContain("START_STAKING");
    // Canonical inputs untouched.
    expect(ctx.walletFlow).toBe(250);
    expect(rewardState.walletFlow).toBe(250);
  });

  it("an active mission journey cannot be dismissed away", () => {
    const mission = item({ kind: "CONTINUE_MISSION", id: "mission:m1", missionId: "m1" });
    const ctx = buildJourneyContext({
      decision: decision({ items: [mission], activeMissionIds: ["m1"] }),
      rewardState: reward(),
      signedIn: true,
    });
    const sel = selectJourneys({
      ctx,
      presentation: { dismissed: ["CONTINUE_MISSION"], skipped: [], snoozedUntil: {} },
    });
    expect(sel.primary?.journeyId).toBe("CONTINUE_MISSION");
  });

  it("an expired snooze restores the journey", () => {
    const ctx = buildJourneyContext({
      decision: decision(),
      rewardState: reward({ walletFlow: 250 }),
      signedIn: true,
    });
    const past = selectJourneys({
      ctx,
      presentation: { dismissed: [], skipped: [], snoozedUntil: { START_STAKING: 1000 } },
      now: 5000,
    });
    expect(past.primary?.journeyId).toBe("START_STAKING");
  });

  it("shows at most one primary and one secondary journey", () => {
    const ctx = buildJourneyContext({
      decision: decision({ completedMissionCount: 2 }),
      rewardState: reward({ flowPointsTotal: 5000, walletFlow: 100 }),
      signedIn: true,
    });
    const sel = selectJourneys({ ctx });
    expect(sel.primary).not.toBeNull();
    expect(sel.secondary?.journeyId).not.toBe(sel.primary?.journeyId);
  });
});
