/**
 * FlowBridge V26 §5/§6/§7 — deterministic journey selection and stage resolution.
 *
 * Pure and economically inert. Given canonical state (a frozen V22 decision
 * result + the canonical V17.1B reward state) it returns at most one primary and
 * one secondary journey, with every stage status RECOMPUTED from that state.
 *
 * It never advances a stage from a click, never creates a mission, never touches
 * an ActionIntent, and never mixes Campaign PTS into a FLOW stage.
 */
import type { RewardState } from "@/lib/rewards/rewardStateTruth";
import type { DecisionResult } from "../decision/decisionTypes";
import { dedupeItems } from "../experience/experienceModel";
import { JOURNEY_REGISTRY } from "./journeyRegistry";
import {
  EMPTY_JOURNEY_PRESENTATION,
  JOURNEY_POLICY_VERSION,
  JOURNEY_SCHEMA_VERSION,
  STAGE_LABEL,
  isAllowedDestination,
  type JourneyContext,
  type JourneyDefinition,
  type JourneyId,
  type JourneyPresentationState,
  type JourneySelection,
  type JourneyStageStatus,
  type ResolvedJourney,
  type ResolvedJourneyStage,
} from "./journeyTypes";

export interface RewardStateLike extends Partial<RewardState> {
  walletAddress?: string | null;
}

/** V26 §6 — the only supported way to build a journey context. */
export function buildJourneyContext(input: {
  decision: DecisionResult | null;
  rewardState: RewardStateLike | null;
  signedIn: boolean;
  /** Canonical activity presence (verified settlements, claims or points). */
  hasActivity?: boolean;
  campaignsAvailable?: boolean;
}): JourneyContext {
  const { decision, rewardState, signedIn } = input;
  const items = dedupeItems(decision?.items ?? []);
  const activeMission = items.find((i) => i.kind === "CONTINUE_MISSION") ?? null;

  const flowPointsTotal = Number(rewardState?.flowPointsTotal ?? 0);
  const claimedFlow = rewardState?.claimedFlow ?? null;
  const walletFlow = rewardState?.walletFlow ?? null;

  return {
    signedIn,
    walletBound: !!rewardState?.walletAddress,
    flowPointsTotal,
    convertibleFlowPoints: Number(rewardState?.convertibleFlowPoints ?? 0),
    claimableFlow: rewardState?.claimableFlow ?? null,
    claimedFlow,
    walletFlow,
    campaignPts: rewardState?.campaignPts ?? null,
    conversionMinimum: Number(rewardState?.conversionMinimum ?? 0),
    rewardRequirementsMet: !!rewardState?.requirementsMet,
    rewardNextStep: rewardState?.nextEconomicStep ?? "NONE",
    rewardStateReadable: !!rewardState && rewardState.provenance !== "DEGRADED",
    activeMission,
    activeMissionCount: decision?.activeMissionIds.length ?? (activeMission ? 1 : 0),
    completedMissionCount: decision?.completedMissionCount ?? 0,
    missionNeedsWallet: !!activeMission?.requiresWalletConfirmation,
    missionBlockerText: activeMission?.blockerText ?? null,
    items,
    campaignsAvailable:
      input.campaignsAvailable ?? items.some((i) => i.domain === "CAMPAIGNS"),
    hasHistory:
      input.hasActivity ??
      (flowPointsTotal > 0 || (claimedFlow ?? 0) > 0 || (walletFlow ?? 0) > 0 || (decision?.completedMissionCount ?? 0) > 0),
    degraded: decision?.status === "DEGRADED",
  };
}

const OPEN: readonly JourneyStageStatus[] = ["NEEDS_YOU", "READY", "VERIFYING", "EXPLORE"];

export function resolveJourney(def: JourneyDefinition, ctx: JourneyContext): ResolvedJourney {
  const stages: ResolvedJourneyStage[] = def.stages.map((s) => {
    const status = s.status(ctx);
    return { id: s.id, title: s.title, body: s.body, status, label: STAGE_LABEL[status] };
  });

  const completedStages = stages.filter((s) => s.status === "COMPLETED").length;
  // The current stage is the first non-completed stage, ordered by how much it
  // needs the user. Never derived from what the user last tapped.
  let current = stages.find((s) => s.status !== "COMPLETED") ?? null;
  for (const status of OPEN) {
    const hit = stages.find((s) => s.status === status);
    if (hit) {
      current = hit;
      break;
    }
  }
  if (!current) current = stages[stages.length - 1]!;

  const primaryCta = def.primaryCta(ctx);
  const secondaryCta = def.secondaryCta?.(ctx) ?? null;
  // Hard guard: a journey can only ever navigate to an approved product surface.
  if (!isAllowedDestination(primaryCta.href)) {
    throw new Error(`V26: journey ${def.journeyId} used an unapproved destination`);
  }

  return {
    schemaVersion: JOURNEY_SCHEMA_VERSION,
    policyVersion: JOURNEY_POLICY_VERSION,
    journeyId: def.journeyId,
    version: def.version,
    title: def.title,
    summary: def.summary,
    stages,
    currentStageId: current.id,
    currentStatus: current.status,
    completedStages,
    totalStages: stages.length,
    percent: stages.length === 0 ? 0 : Math.round((completedStages / stages.length) * 100),
    primaryCta,
    secondaryCta: secondaryCta && isAllowedDestination(secondaryCta.href) ? secondaryCta : null,
    completionEvidence: def.completionEvidence,
    prompts: def.prompts,
    urgent: def.urgent,
    createsMission: false,
    createsActionIntent: false,
    grantsAuthority: false,
  };
}

function hiddenNow(
  id: JourneyId,
  state: JourneyPresentationState,
  now: number,
): boolean {
  if (state.dismissed.includes(id)) return true;
  if (state.skipped.includes(id)) return true;
  const until = state.snoozedUntil[id];
  return typeof until === "number" && until > now;
}

/**
 * V26 §7/§10 — progressive disclosure: exactly one primary journey plus at most
 * one secondary discovery path. Urgent journeys (an active mission) can never be
 * dismissed out of the primary slot, because doing so would invite a duplicate.
 */
export function selectJourneys(input: {
  ctx: JourneyContext;
  presentation?: JourneyPresentationState;
  now?: number;
}): JourneySelection {
  const state = input.presentation ?? EMPTY_JOURNEY_PRESENTATION;
  const now = input.now ?? Date.now();

  const eligible = JOURNEY_REGISTRY.filter((d) => d.eligible(input.ctx)).sort(
    (a, b) => b.displayPriority - a.displayPriority,
  );

  const hiddenByUser: JourneyId[] = [];
  const visible: JourneyDefinition[] = [];
  for (const def of eligible) {
    if (!def.urgent && hiddenNow(def.journeyId, state, now)) {
      hiddenByUser.push(def.journeyId);
      continue;
    }
    visible.push(def);
  }

  const primaryDef = visible[0] ?? null;
  const secondaryDef = visible.find((d) => d !== primaryDef && !d.urgent) ?? null;

  return {
    primary: primaryDef ? resolveJourney(primaryDef, input.ctx) : null,
    secondary: secondaryDef ? resolveJourney(secondaryDef, input.ctx) : null,
    hiddenByUser,
    exploreOnly: !primaryDef,
  };
}
