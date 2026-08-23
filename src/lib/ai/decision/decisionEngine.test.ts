/**
 * V22 §13/§14 — deterministic acceptance tests for the decision engine.
 */
import { describe, expect, it } from "vitest";
import { runDecisionEngine } from "./decisionEngine";
import { extractDecisionPreferences } from "./decisionPreferences";
import { EMPTY_PREFERENCES, type DecisionMissionContext } from "./decisionTypes";
import type { RankedOpportunity } from "../opportunity/opportunityTypes";

const NOW = new Date("2026-01-01T12:00:00.000Z");

function opp(over: Partial<RankedOpportunity> & { id: string }): RankedOpportunity {
  return {
    id: over.id,
    type: over.type ?? "CLAIM_FLOW",
    domain: over.domain ?? "REWARDS",
    actorScope: "AUTHENTICATED_USER",
    title: over.title ?? "Claim FLOW",
    reason: over.reason ?? "You have claimable FLOW.",
    priority: over.priority ?? "HIGH",
    reasonCodes: [],
    provenance: over.provenance ?? "LIVE",
    confidence: "HIGH" as any,
    createdAt: over.createdAt ?? NOW.toISOString(),
    staleAfter: over.staleAfter ?? new Date(NOW.getTime() + 600_000).toISOString(),
    expiresAt: over.expiresAt ?? null,
    evidenceRefs: over.evidenceRefs ?? ([
      {
        id: "ev1",
        label: "Rewards ledger",
        dataClass: "FLOWBRIDGE_DB",
        authority: "CANONICAL",
        freshness: "REALTIME",
        observedAt: NOW.toISOString(),
      },
    ] as any),
    economicSnapshot: over.economicSnapshot ?? { claimableFlow: 500 },
    containsPrivateEvidence: true,
    recommendedSurface: over.recommendedSurface ?? { label: "Open rewards", href: "/rewards" },
    preparableAction:
      over.preparableAction === undefined
        ? ({ type: "CLAIM", chainId: 1, parameters: {}, cta: "Claim" } as any)
        : over.preparableAction,
    score: over.score ?? 100,
    scoreReasons: [],
  } as RankedOpportunity;
}

function mission(over: Partial<DecisionMissionContext>): DecisionMissionContext {
  return {
    id: over.id ?? "m1",
    status: over.status ?? "ACTIVE",
    goalText: over.goalText ?? "Claim FLOW then stake it",
    outcome: over.outcome ?? "CLAIM_THEN_STAKE",
    domains: over.domains ?? ["REWARDS", "STAKING"],
    currentStepTitle: over.currentStepTitle ?? "Stake 500 FLOW",
    currentStepRequiresWallet: over.currentStepRequiresWallet ?? true,
    hasPendingWalletStep: over.hasPendingWalletStep ?? true,
    blockingReason: over.blockingReason ?? null,
    completedAt: over.completedAt ?? null,
    updatedAt: over.updatedAt ?? NOW.toISOString(),
    percent: over.percent ?? 50,
  };
}

function base(over: Partial<Parameters<typeof runDecisionEngine>[0]> = {}) {
  return runDecisionEngine({
    requestId: "r1",
    actorScopes: ["AUTHENTICATED_USER"],
    opportunities: [],
    missions: [],
    preferences: EMPTY_PREFERENCES,
    viewStates: [],
    degradedDomains: [],
    now: NOW,
    ...over,
  });
}

describe("V22 decision engine", () => {
  it("never executes, prepares or creates missions", () => {
    const r = base({ opportunities: [opp({ id: "a" })] });
    expect(r.executed).toBe(false);
    expect(r.createdActionIntent).toBe(false);
    expect(r.missionsCreated).toBe(0);
  });

  it("ranks claimable FLOW above staking when the claim is the prerequisite", () => {
    const r = base({
      opportunities: [
        opp({ id: "stake", domain: "STAKING", type: "START_STAKING", title: "Stake FLOW", score: 100 }),
        opp({ id: "claim", type: "CLAIM_FLOW", score: 100 }),
      ],
    });
    expect(r.items[0]!.opportunityId).toBe("claim");
    expect(r.items[0]!.reasonCodes).toContain("READY_TO_CLAIM");
    expect(r.items[0]!.reasonCodes).toContain("PREREQUISITE_FOR_STAKING");
  });

  it("surfaces continue-mission and suppresses duplicate recommendations", () => {
    const r = base({
      opportunities: [opp({ id: "claim" })],
      missions: [mission({})],
    });
    expect(r.items[0]!.kind).toBe("CONTINUE_MISSION");
    expect(r.items[0]!.rank).toBe(1);
    expect(r.suppressed.some((s) => s.reasonCodes.includes("DUPLICATE_OF_ACTIVE_MISSION"))).toBe(true);
    expect(r.missionsCreated).toBe(0);
  });

  it("keeps dismissed items economically valid while hiding them", () => {
    const r = base({
      opportunities: [opp({ id: "claim" })],
      viewStates: [{ key: "claim", dismissedAt: new Date(NOW.getTime() - 1000).toISOString() }],
    });
    expect(r.items.some((i) => i.opportunityId === "claim")).toBe(false);
    const s = r.suppressed.find((x) => x.id === "claim")!;
    expect(s.reasonCodes).toContain("DISMISSED_BY_USER");
    expect(s.explanation).toMatch(/still valid/i);
  });

  it("lets a dismissed identity resurface after the dismissal window", () => {
    const r = base({
      opportunities: [opp({ id: "claim" })],
      viewStates: [
        { key: "claim", dismissedAt: new Date(NOW.getTime() - 8 * 24 * 3_600_000).toISOString() },
      ],
    });
    expect(r.items[0]!.opportunityId).toBe("claim");
  });

  it("downgrades stale evidence to non-actionable instead of guessing", () => {
    const r = base({
      opportunities: [
        opp({ id: "claim", staleAfter: new Date(NOW.getTime() - 1000).toISOString() }),
      ],
    });
    expect(r.items[0]!.actionable).toBe(false);
    expect(r.items[0]!.reasonCodes).toContain("STALE_OR_LOW_CONFIDENCE");
    expect(r.status).toBe("NOTHING_ACTIONABLE");
    expect(r.notice).toMatch(/will not invent/i);
  });

  it("only copies canonical economic facts verbatim", () => {
    const r = base({ opportunities: [opp({ id: "claim", economicSnapshot: { claimableFlow: 500 } })] });
    expect(r.items[0]!.facts).toEqual([
      { label: "claimableFlow", value: "500", source: "CANONICAL_SNAPSHOT" },
    ]);
  });

  it("applies opt-in preferences to order only", () => {
    const prefs = extractDecisionPreferences([
      { key: "pref.style", value: "I prefer staking over trading" },
      { key: "pref.size", value: "always stake 250 FLOW" },
    ]);
    expect(prefs.prefersStaking).toBe(true);
    expect(prefs.ignoredEconomicKeys).toContain("pref.size");

    const r = base({
      opportunities: [
        opp({ id: "stake", domain: "STAKING", type: "START_STAKING", score: 100, economicSnapshot: {} }),
        opp({ id: "campaign", domain: "CAMPAIGNS", type: "CAMPAIGN_ELIGIBLE", score: 100, economicSnapshot: {} }),
      ],
      preferences: prefs,
    });
    expect(r.items[0]!.opportunityId).toBe("stake");
    expect(r.items[0]!.reasonCodes).toContain("USER_PREFERS_STAKING");
    // Preference text never becomes an economic value.
    expect(JSON.stringify(r.items[0]!.facts)).not.toMatch(/250/);
  });

  it("keeps actors isolated: nothing is cached or shared between callers", () => {
    const a = base({
      actorScopes: ["AUTHENTICATED_USER"],
      opportunities: [opp({ id: "actorA-claim", economicSnapshot: { claimableFlow: 500 } })],
      missions: [mission({ id: "mA" })],
    });
    const b = base({
      actorScopes: ["PUBLIC"],
      opportunities: [opp({ id: "actorB-campaign", domain: "CAMPAIGNS", type: "CAMPAIGN_ELIGIBLE", economicSnapshot: { campaignPoints: 10 } })],
      missions: [],
    });
    expect(b.activeMissionIds).toEqual([]);
    expect(JSON.stringify(b)).not.toMatch(/actorA|mA|claimableFlow/);
    expect(a.activeMissionIds).toEqual(["mA"]);
    // Re-running actor A after actor B is unaffected by B.
    const a2 = base({
      actorScopes: ["AUTHENTICATED_USER"],
      opportunities: [opp({ id: "actorA-claim", economicSnapshot: { claimableFlow: 500 } })],
      missions: [mission({ id: "mA" })],
    });
    expect(JSON.stringify(a2.items)).toBe(JSON.stringify(a.items));
  });

  it("does not permanently suppress a new opportunity after a completed mission", () => {
    const r = base({
      opportunities: [opp({ id: "claim" })],
      missions: [
        mission({
          id: "old",
          status: "COMPLETED",
          completedAt: new Date(NOW.getTime() - 60_000).toISOString(),
          domains: ["REWARDS"],
        }),
      ],
    });
    expect(r.items[0]!.opportunityId).toBe("claim");
    expect(r.items[0]!.reasonCodes).toContain("RECENTLY_COMPLETED_SIMILAR");
    expect(r.items[0]!.actionable).toBe(true);
  });

  it("is deterministic for identical input", () => {
    const args = { opportunities: [opp({ id: "a" }), opp({ id: "b", domain: "STAKING" as const, type: "START_STAKING" })] };
    expect(JSON.stringify(base(args).items)).toBe(JSON.stringify(base(args).items));
  });
});
