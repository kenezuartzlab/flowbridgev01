/**
 * FlowBridge V22 §3/§7/§12 — server-only decision resolution.
 *
 * Everything authoritative happens here: identity, canonical opportunity
 * resolution, read-only mission context, presentation state and opt-in
 * preference signals. Ranking weights and explanation facts are NEVER accepted
 * from the client, and this module cannot execute, prepare or persist anything
 * economic.
 */
import type { FlowAiActor } from "../aiTypes";
import type { OpportunityDomain } from "../opportunity/opportunityTypes";
import type { Mission } from "../mission/missionTypes";
import { missionProgress } from "../mission/missionTypes";
import { extractDecisionPreferences } from "./decisionPreferences";
import { runDecisionEngine } from "./decisionEngine";
import {
  EMPTY_PREFERENCES,
  type DecisionMissionContext,
  type DecisionResult,
} from "./decisionTypes";

/** Maps a mission outcome to the canonical domains it already covers. */
export function missionDomains(mission: Mission): OpportunityDomain[] {
  switch (mission.goal.outcome) {
    case "CLAIM_THEN_STAKE":
      return ["REWARDS", "STAKING"];
    case "SWAP_THEN_STAKE":
      return ["TRADE", "STAKING"];
    case "CLAIM_ONLY":
      return ["REWARDS"];
    case "STAKE_ONLY":
      return ["STAKING"];
    case "SWAP_ONLY":
      return ["TRADE"];
    case "CAMPAIGNS_NO_SPEND":
      return ["CAMPAIGNS"];
    default:
      return [];
  }
}

export function toMissionContext(mission: Mission): DecisionMissionContext {
  const step =
    mission.steps.find((s) => s.id === mission.currentStepId) ??
    mission.steps.find((s) => s.state !== "COMPLETED" && s.state !== "CANCELLED") ??
    null;
  return {
    id: mission.id,
    status: mission.status,
    goalText: mission.goalText,
    outcome: mission.goal.outcome,
    domains: missionDomains(mission),
    currentStepTitle: step?.title ?? null,
    currentStepRequiresWallet: !!step?.requiresWalletSignature,
    blockingReason: step?.blockingReason ?? null,
    completedAt: mission.completedAt ?? null,
    updatedAt: mission.updatedAt,
    percent: missionProgress(mission).percent,
  };
}

export async function resolveDecision(input: {
  actor: FlowAiActor;
  requestId: string;
  limit?: number;
  now?: Date;
}): Promise<DecisionResult> {
  const now = input.now ?? new Date();
  const actor = input.actor;

  const { generateOpportunityFeed } = await import("../opportunity/opportunityEngine.server");

  let states: { key: string; lastSeenAt?: string | null; dismissedAt?: string | null; snoozedUntil?: string | null }[] =
    [];
  let missions: DecisionMissionContext[] = [];
  let preferences = EMPTY_PREFERENCES;

  if (actor.userId) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      const { data } = await supabaseAdmin
        .from("ai_opportunity_state")
        .select("opportunity_key,last_seen_at,dismissed_at,snoozed_until")
        .eq("user_id", actor.userId);
      states = (data ?? []).map((r: any) => ({
        key: r.opportunity_key,
        lastSeenAt: r.last_seen_at,
        dismissedAt: r.dismissed_at,
        snoozedUntil: r.snoozed_until,
      }));
    } catch {
      states = [];
    }

    try {
      const { listMissions } = await import("../mission/missionStore.server");
      const list = await listMissions({ userId: actor.userId, limit: 20 });
      missions = list.map(toMissionContext);
    } catch {
      missions = [];
    }

    try {
      const { listUserMemory } = await import("../memoryStore.server");
      preferences = extractDecisionPreferences(await listUserMemory(actor));
    } catch {
      preferences = EMPTY_PREFERENCES;
    }
  }

  // A wider canonical candidate set so ranking (not truncation) decides order.
  const feed = await generateOpportunityFeed({ actor, states, limit: 8, now });

  return runDecisionEngine({
    requestId: input.requestId,
    actorScopes: feed.actorScopes,
    opportunities: feed.items,
    missions,
    preferences,
    viewStates: states,
    degradedDomains: feed.degradedDomains,
    limit: input.limit,
    now,
  });
}
