/**
 * FlowBridge V23 §2/§11 — server-only scenario resolution.
 *
 * The canonical snapshot is resolved HERE, from authoritative sources only:
 *   REWARDS — server FLOW payout ledger
 *   STAKING — live vault reads (V15.1 evidence loader)
 *   MISSIONS — read-only V17 mission context
 * The client contributes bounded planning inputs and nothing else.
 *
 * This module performs zero economic writes: no Mission, no ActionIntent, no
 * approval, no signature, no transaction.
 */
import type { FlowAiActor } from "../aiTypes";
import { actorScopes } from "../skillRegistry";
import { EMPTY_PREFERENCES, type DecisionMissionContext } from "../decision/decisionTypes";
import { extractDecisionPreferences } from "../decision/decisionPreferences";
import { toMissionContext } from "../decision/decisionService.server";
import { canonicalSnapshotId, runScenarioEngine } from "./scenarioEngine";
import { memoryPrefersHalf, sanitizePlanningInputs } from "./scenarioPlanning";
import type { CanonicalScenarioSnapshot, ScenarioSet } from "./scenarioTypes";

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.replace(/,/g, "")) : Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function resolveScenarioSet(input: {
  actor: FlowAiActor;
  requestId: string;
  planning?: Record<string, unknown> | null;
  previousSnapshotId?: string | null;
  now?: Date;
}): Promise<ScenarioSet> {
  const now = input.now ?? new Date();
  const actor = input.actor;
  const scopes = actorScopes(actor);

  let claimableFlow: number | null = null;
  let boundWallet: string | null = null;
  let missions: DecisionMissionContext[] = [];
  let preferences = EMPTY_PREFERENCES;
  let memoryEntries: { key: string; value: string }[] = [];
  const degradedDomains: ("REWARDS" | "STAKING")[] = [];

  if (actor.userId) {
    try {
      const { getUserPointsAndReferrals } = await import("@/lib/flowbridge-db.server");
      const inc: any = await getUserPointsAndReferrals(actor.userId);
      claimableFlow = num(inc?.claimableTotal);
    } catch {
      degradedDomains.push("REWARDS");
    }
    try {
      const { getProfileWallet } = await import("@/lib/campaign/campaignApi.server");
      boundWallet = await getProfileWallet(actor.userId);
    } catch {
      boundWallet = null;
    }
    try {
      const { listMissions } = await import("../mission/missionStore.server");
      missions = (await listMissions({ userId: actor.userId, limit: 20 })).map(toMissionContext);
    } catch {
      missions = [];
    }
    try {
      const { listUserMemory } = await import("../memoryStore.server");
      memoryEntries = await listUserMemory(actor);
      preferences = extractDecisionPreferences(memoryEntries);
    } catch {
      memoryEntries = [];
      preferences = EMPTY_PREFERENCES;
    }
  }

  /* ------------------------------------------------- live canonical staking */
  let chainId: number | null = null;
  let vault: string | null = null;
  let stakingAvailable = false;
  let minStakeFlow: number | null = null;
  let stakedFlow: number | null = null;
  let earnedFlow: number | null = null;
  let evidenceRefs: any[] = [];
  try {
    const { loadStakingEvidence } = await import("../stakingEvidence.server");
    const evidence = await loadStakingEvidence(boundWallet);
    if (evidence.length === 0) throw new Error("STAKING");
    evidenceRefs = evidence.filter((e) => e.dataClass === "ON_CHAIN");
    const vaultValue = (evidence.find((e) => e.id === "chain.staking.vault")?.value ?? {}) as any;
    const posValue = (evidence.find((e) => e.id === "chain.staking.position")?.value ?? {}) as any;
    chainId = num(vaultValue.chainId);
    vault = typeof vaultValue.vault === "string" ? vaultValue.vault : null;
    minStakeFlow = num(vaultValue.minStakeFlow);
    stakingAvailable = !!vault && vaultValue.paused !== true;
    stakedFlow = boundWallet ? num(posValue.stakedFlow) : null;
    earnedFlow = boundWallet ? num(posValue.earnedFlow) : null;
  } catch {
    degradedDomains.push("STAKING");
  }

  /**
   * §3 — a scenario is only exposed when its canonical action is currently
   * supported by V16/V18/V17. These identities are server-derived, never
   * client-asserted.
   */
  const supportedOpportunityKinds: string[] = [];
  if (actor.userId && typeof claimableFlow === "number" && claimableFlow > 0) {
    supportedOpportunityKinds.push("REWARDS:CLAIM_FLOW");
  }
  if (actor.userId && stakingAvailable) {
    supportedOpportunityKinds.push("STAKING:START_STAKING");
  }

  const snapshot: CanonicalScenarioSnapshot = {
    snapshotId: canonicalSnapshotId({
      boundWallet,
      chainId,
      vault,
      claimableFlow,
      stakedFlow,
      earnedFlow,
      minStakeFlow,
      stakingAvailable,
      supportedOpportunityKinds,
    }),
    observedAt: now.toISOString(),
    freshness: degradedDomains.length > 0 ? "PARTIAL" : "REALTIME",
    provenance: degradedDomains.length > 0 ? "DEGRADED" : "LIVE",
    boundWallet,
    chainId,
    vault,
    stakingAvailable,
    claimableFlow,
    stakedFlow,
    earnedFlow,
    minStakeFlow,
    supportedOpportunityKinds,
    degradedDomains,
    evidenceRefs,
  };

  const planning = sanitizePlanningInputs(input.planning, {
    memoryOptedIn: preferences.optedIn,
    memoryPrefersHalf: memoryPrefersHalf(memoryEntries),
  });

  return runScenarioEngine({
    requestId: input.requestId,
    actorScopes: scopes,
    snapshot,
    missions,
    planning,
    preferences,
    previousSnapshotId: input.previousSnapshotId ?? null,
    now,
  });
}
