/**
 * FlowBridge V23 §13/§14 — deterministic scenario canary.
 *
 * Proves exact/preview/unknown classification, deterministic ordering,
 * mission-aware replacement, planning-input isolation and total economic
 * inertness (zero mission/intent/signature/transaction output).
 */
import { describe, expect, it } from "vitest";
import { canonicalSnapshotId, previewPortionFlow, runScenarioEngine } from "./scenarioEngine";
import { memoryPrefersHalf, sanitizePlanningInputs } from "./scenarioPlanning";
import type { CanonicalScenarioSnapshot } from "./scenarioTypes";
import type { DecisionMissionContext } from "../decision/decisionTypes";

const NOW = new Date("2026-08-24T00:00:00.000Z");
const CLAIMABLE = 1_001;

function snapshot(over: Partial<CanonicalScenarioSnapshot> = {}): CanonicalScenarioSnapshot {
  const base = {
    boundWallet: "0xabc0000000000000000000000000000000000001",
    chainId: 968,
    vault: "0x36f2318027edf79D083Aac98D66C9a1b3e2AAdD1",
    claimableFlow: CLAIMABLE,
    stakedFlow: 0,
    earnedFlow: 0,
    minStakeFlow: 10,
    stakingAvailable: true,
    supportedOpportunityKinds: ["REWARDS:CLAIM_FLOW", "STAKING:START_STAKING"],
  };
  const merged = { ...base, ...over } as any;
  return {
    snapshotId: canonicalSnapshotId(merged),
    observedAt: NOW.toISOString(),
    freshness: "REALTIME",
    provenance: "LIVE",
    degradedDomains: [],
    evidenceRefs: [],
    ...merged,
    ...over,
  } as CanonicalScenarioSnapshot;
}

function mission(over: Partial<DecisionMissionContext> = {}): DecisionMissionContext {
  return {
    id: "m1",
    status: "ACTIVE",
    goalText: "Claim my FLOW rewards and stake the claimed FLOW",
    outcome: "CLAIM_THEN_STAKE",
    domains: ["REWARDS", "STAKING"],
    currentStepTitle: "Claim FLOW",
    currentStepRequiresWallet: true,
    hasPendingWalletStep: true,
    blockingReason: null,
    completedAt: null,
    updatedAt: NOW.toISOString(),
    percent: 40,
    ...over,
  };
}

const run = (over: Partial<Parameters<typeof runScenarioEngine>[0]> = {}) =>
  runScenarioEngine({
    requestId: "req-1",
    actorScopes: ["PUBLIC", "AUTHENTICATED_USER"],
    snapshot: snapshot(),
    missions: [],
    now: NOW,
    ...over,
  });

describe("V23 scenario engine", () => {
  it("§13 CLAIM_ONLY reports claimable as canonical exact and no downstream stake value", () => {
    const set = run();
    const claim = set.scenarios.find((s) => s.scenarioKind === "CLAIM_ONLY")!;
    const fact = claim.exactFacts.find((f) => f.label === "claimableFlowNow")!;
    expect(fact.value).toBe(String(CLAIMABLE));
    expect(fact.valueClass).toBe("CANONICAL_EXACT");
    expect(claim.estimatedFacts).toHaveLength(0);
    expect(claim.expectedWalletConfirmations).toBe(1);
  });

  it("§13 CLAIM_THEN_STAKE_PERCENT(50) previews floor(X*50%) and keeps execution unresolved", () => {
    const set = run({
      planning: {
        stakePercent: 50,
        previewStakeFlow: null,
        preSelectedFromMemory: false,
        rejectedClientFields: [],
      },
    });
    const s = set.scenarios.find((x) => x.scenarioKind === "CLAIM_THEN_STAKE_PERCENT")!;
    const portion = s.estimatedFacts[0]!;
    expect(portion.value).toBe(String(Math.floor(CLAIMABLE * 0.5)));
    expect(portion.valueClass).toBe("DERIVED_PREVIEW");
    expect(s.unresolvedExecutionValues.join(" ")).toMatch(/derived only from the FLOW actually verified/i);
    expect(s.candidateMissionTemplate).toEqual({
      templateId: "CLAIM_THEN_STAKE",
      opportunityKind: "REWARDS:CLAIM_FLOW",
      authorized: false,
    });
    expect(s.expectedWalletConfirmations).toBe(2);
  });

  it("§14 emits NO_ACTION, CLAIM_ONLY and CLAIM_THEN_STAKE in deterministic order, inert", () => {
    const a = run();
    const b = run();
    expect(a.scenarios.map((s) => s.scenarioKind)).toEqual([
      "CLAIM_THEN_STAKE_PERCENT",
      "CLAIM_ONLY",
      "NO_ACTION",
    ]);
    expect(a.scenarios.map((s) => s.scenarioId)).toEqual(b.scenarios.map((s) => s.scenarioId));
    expect(a.createdMissions).toBe(0);
    expect(a.createdActionIntents).toBe(0);
    expect(a.executed).toBe(false);
    // No scenario ever carries an authorized executable amount.
    for (const s of a.scenarios) {
      expect(s.candidateMissionTemplate?.authorized ?? false).toBe(false);
    }
  });

  it("§13 a remembered 'stake half' pre-selects 50% but authorizes nothing", () => {
    const planning = sanitizePlanningInputs(
      {},
      { memoryOptedIn: true, memoryPrefersHalf: memoryPrefersHalf([{ key: "pref_style", value: "stake half" }]) },
    );
    expect(planning.stakePercent).toBe(50);
    expect(planning.preSelectedFromMemory).toBe(true);
    const set = run({ planning, preferences: { optedIn: true, prefersStaking: true, prefersRewards: false, prefersLowInteraction: false, usedKeys: ["pref_style"], ignoredEconomicKeys: [] } });
    expect(set.memoryUsed).toBe(true);
    expect(set.createdMissions).toBe(0);
  });

  it("§13 external/client economic input is rejected, never used", () => {
    const planning = sanitizePlanningInputs({
      stakePercent: 50,
      recommendedAmount: 750,
      contract: "0xdeadbeef",
      fee: "0.01",
      claimableFlow: 999999,
      calldata: "0xabcdef",
    });
    expect(planning.stakePercent).toBe(50);
    expect(planning.previewStakeFlow).toBeNull();
    expect([...planning.rejectedClientFields].sort()).toEqual([
      "calldata",
      "claimableFlow",
      "contract",
      "fee",
      "recommendedAmount",
    ]);
    const set = run({ planning });
    const json = JSON.stringify(set);
    expect(json).not.toContain("750");
    expect(json).not.toContain("0xdeadbeef");
    expect(json).not.toContain("999999");
  });

  it("§9 an equivalent active mission replaces the duplicate scenario path", () => {
    const set = run({ missions: [mission()] });
    expect(set.scenarios[0]!.scenarioKind).toBe("CONTINUE_MISSION");
    expect(set.recommendedScenarioId).toBe(set.scenarios[0]!.scenarioId);
    expect(set.scenarios.map((s) => s.scenarioKind)).not.toContain("CLAIM_THEN_STAKE_PERCENT");
    expect(set.suppressedScenarioKinds).toContain("CLAIM_ONLY");
    expect(set.activeMissionIds).toEqual(["m1"]);
    expect(set.createdMissions).toBe(0);
  });

  it("§11 a canonical input change makes the previous ScenarioSet stale", () => {
    const first = run();
    const second = runScenarioEngine({
      requestId: "req-2",
      actorScopes: ["PUBLIC", "AUTHENTICATED_USER"],
      snapshot: snapshot({ claimableFlow: CLAIMABLE + 5 }),
      missions: [],
      previousSnapshotId: first.snapshot.snapshotId,
      now: NOW,
    });
    expect(second.stale).toBe(true);
    expect(second.staleReason).toMatch(/changed/i);
    const same = runScenarioEngine({
      requestId: "req-3",
      actorScopes: ["PUBLIC"],
      snapshot: snapshot(),
      missions: [],
      previousSnapshotId: first.snapshot.snapshotId,
      now: NOW,
    });
    expect(same.stale).toBe(false);
  });

  it("§15 changing only a planning input changes only preview outputs", () => {
    const p = (percent: 25 | 50) => ({
      stakePercent: percent,
      previewStakeFlow: null,
      preSelectedFromMemory: false,
      rejectedClientFields: [],
    });
    const a = run({ planning: p(25) });
    const b = run({ planning: p(50) });
    const pick = (set: typeof a) => set.scenarios.find((s) => s.scenarioKind === "CLAIM_THEN_STAKE_PERCENT")!;
    expect(pick(a).scenarioId).toBe(pick(b).scenarioId);
    expect(a.snapshot.snapshotId).toBe(b.snapshot.snapshotId);
    expect(pick(a).exactFacts).toEqual(pick(b).exactFacts);
    expect(pick(a).estimatedFacts[0]!.value).toBe(String(previewPortionFlow(CLAIMABLE, 25)));
    expect(pick(b).estimatedFacts[0]!.value).toBe(String(previewPortionFlow(CLAIMABLE, 50)));
    expect(pick(a).unresolvedExecutionValues).toEqual(pick(b).unresolvedExecutionValues);
  });

  it("§3 unsupported canonical actions are not simulated", () => {
    const set = run({
      snapshot: snapshot({ claimableFlow: 0, supportedOpportunityKinds: [], stakingAvailable: false }),
    });
    expect(set.scenarios.map((s) => s.scenarioKind)).toEqual(["NO_ACTION"]);
    expect(set.status).toBe("NOTHING_TO_COMPARE");
    expect(set.notice).toMatch(/not inventing/i);
  });

  it("§13 cross-actor snapshots cannot collide or share cache", () => {
    const a = snapshot();
    const b = snapshot({ boundWallet: "0xabc0000000000000000000000000000000000002", claimableFlow: 7 });
    expect(a.snapshotId).not.toBe(b.snapshotId);
    const setB = run({ snapshot: b });
    expect(JSON.stringify(setB)).not.toContain(String(CLAIMABLE));
  });

  it("§7 STAKE_EXISTING_FLOW appears only with a planning amount and never claims a balance", () => {
    const set = run({
      planning: {
        stakePercent: null,
        previewStakeFlow: 250,
        preSelectedFromMemory: false,
        rejectedClientFields: [],
      },
    });
    const s = set.scenarios.find((x) => x.scenarioKind === "STAKE_EXISTING_FLOW")!;
    expect(s.estimatedFacts[0]!.valueClass).toBe("DERIVED_PREVIEW");
    expect(s.exactFacts.find((f) => f.label === "walletFlowBalance")!.value).toBe("not available");
    expect(s.unresolvedExecutionValues.join(" ")).toMatch(/wallet FLOW balance/i);
  });
});
