/**
 * FlowBridge V26 §4/§6/§7 — typed Guided Journey contracts.
 *
 * A Journey is TEACHING + NAVIGATION only. It carries no economic authority:
 * it cannot create a Mission, cannot create an ActionIntent, cannot sign, cannot
 * settle, and its stages are NEVER advanced by clicks, page views or analytics.
 * Every stage status is recomputed from canonical product state (V22 decision
 * result + V17.1B reward state) each time it is read.
 *
 * Pure module: types, constants and human labels only.
 */
import type { DecisionItem, DecisionResult } from "../decision/decisionTypes";

export const JOURNEY_SCHEMA_VERSION = "flowbridge.journey/1" as const;
export const JOURNEY_POLICY_VERSION = "V26" as const;

/** V26 §4 — the ONLY approved journey ids. Nothing else may be rendered. */
export const JOURNEY_IDS = [
  "DISCOVER_FLOWBRIDGE",
  "FIRST_ACTION",
  "REWARDS_TO_FLOW",
  "START_STAKING",
  "CONTINUE_MISSION",
  "MISSION_OUTCOME",
] as const;
export type JourneyId = (typeof JOURNEY_IDS)[number];

/** V26 §7 — human stage labels. Technical lifecycle stays behind details. */
export const JOURNEY_STAGE_STATUSES = [
  "EXPLORE",
  "READY",
  "NEEDS_YOU",
  "VERIFYING",
  "COMPLETED",
] as const;
export type JourneyStageStatus = (typeof JOURNEY_STAGE_STATUSES)[number];

export const STAGE_LABEL: Record<JourneyStageStatus, string> = {
  EXPLORE: "Explore",
  READY: "Ready",
  NEEDS_YOU: "Needs you",
  VERIFYING: "Verifying",
  COMPLETED: "Completed",
};

/**
 * V26 §7 — journeys may hand off ONLY to these existing product surfaces.
 * No journey may render an Approve / Claim / Stake / Swap / Bridge control.
 */
export const ALLOWED_JOURNEY_DESTINATIONS = [
  "/",
  "/home",
  "/trade",
  "/rewards",
  "/earn",
  "/stake",
  "/campaigns",
  "/assistant",
  "/markets",
  "/activity",
] as const;
export type JourneyDestination = (typeof ALLOWED_JOURNEY_DESTINATIONS)[number];

export function isAllowedDestination(href: string): href is JourneyDestination {
  return (ALLOWED_JOURNEY_DESTINATIONS as readonly string[]).includes(href);
}

/**
 * V26 §6 — the canonical inputs eligibility may read. Clicks, impressions and
 * model inference are deliberately absent from this type.
 */
export interface JourneyContext {
  signedIn: boolean;
  walletBound: boolean;
  /** Canonical V17.1B reward stages. `null` = unreadable, never assumed zero. */
  flowPointsTotal: number;
  convertibleFlowPoints: number;
  claimableFlow: number | null;
  claimedFlow: number | null;
  walletFlow: number | null;
  /** Separate ledger. Never mixed into any FLOW stage. */
  campaignPts: number | null;
  conversionMinimum: number;
  rewardRequirementsMet: boolean;
  rewardNextStep: "CLAIM_FLOW" | "CONVERT_FLOW_POINTS" | "NONE";
  rewardStateReadable: boolean;
  /** Read-only mission context from the frozen V22 decision result. */
  activeMission: DecisionItem | null;
  activeMissionCount: number;
  completedMissionCount: number;
  missionNeedsWallet: boolean;
  missionBlockerText: string | null;
  /** Canonically available, ranked opportunities (already deduped). */
  items: readonly DecisionItem[];
  campaignsAvailable: boolean;
  /** True when the actor has any canonical product history at all. */
  hasHistory: boolean;
  degraded: boolean;
}

export interface JourneyStageDefinition {
  id: string;
  title: string;
  body: string;
  /** Recomputed from canonical state only (V26 §6). */
  status: (ctx: JourneyContext) => JourneyStageStatus;
}

export interface JourneyCta {
  label: string;
  href: JourneyDestination;
  /** Secondary CTAs are quieter; never a second dominant action. */
  tone?: "primary" | "ghost";
}

export interface JourneyDefinition {
  journeyId: JourneyId;
  version: string;
  title: string;
  /** One honest sentence. No urgency, no pressure, no invented economics. */
  summary: string;
  /** Higher wins the single primary slot (V26 §4/§7). */
  displayPriority: number;
  /** True when this journey must not be dismissable away from real work. */
  urgent: boolean;
  eligible: (ctx: JourneyContext) => boolean;
  stages: readonly JourneyStageDefinition[];
  destinations: readonly JourneyDestination[];
  primaryCta: (ctx: JourneyContext) => JourneyCta;
  secondaryCta?: (ctx: JourneyContext) => JourneyCta | null;
  /**
   * What canonical evidence would prove this journey's outcome. Presentational
   * documentation of the proof source — never itself proof.
   */
  completionEvidence: string;
  /** Optional canonical opportunity kinds this journey relates to. */
  relatedOpportunityKinds?: readonly string[];
  /** Assistant quick prompts for this journey (V26 §9). */
  prompts: readonly string[];
}

export interface ResolvedJourneyStage {
  id: string;
  title: string;
  body: string;
  status: JourneyStageStatus;
  label: string;
}

export interface ResolvedJourney {
  schemaVersion: typeof JOURNEY_SCHEMA_VERSION;
  policyVersion: typeof JOURNEY_POLICY_VERSION;
  journeyId: JourneyId;
  version: string;
  title: string;
  summary: string;
  stages: readonly ResolvedJourneyStage[];
  /** The stage the user is actually on right now. */
  currentStageId: string;
  currentStatus: JourneyStageStatus;
  completedStages: number;
  totalStages: number;
  percent: number;
  primaryCta: JourneyCta;
  secondaryCta: JourneyCta | null;
  completionEvidence: string;
  prompts: readonly string[];
  urgent: boolean;
  /** Constants: a journey can never do anything economic. */
  createsMission: false;
  createsActionIntent: false;
  grantsAuthority: false;
}

export interface JourneyPresentationState {
  /** Presentation-only. Never touches canonical opportunity/mission state. */
  dismissed: readonly JourneyId[];
  skipped: readonly JourneyId[];
  snoozedUntil: Readonly<Partial<Record<JourneyId, number>>>;
}

export const EMPTY_JOURNEY_PRESENTATION: JourneyPresentationState = {
  dismissed: [],
  skipped: [],
  snoozedUntil: {},
};

export interface JourneySelection {
  primary: ResolvedJourney | null;
  /** At most one secondary discovery path (V26 §7 progressive disclosure). */
  secondary: ResolvedJourney | null;
  /** Eligible but currently hidden by presentation state. */
  hiddenByUser: readonly JourneyId[];
  /** True when nothing useful is eligible → show exploration/help instead. */
  exploreOnly: boolean;
}

/** Convenience alias for surfaces that already hold a decision result. */
export type JourneyDecisionInput = DecisionResult | null;
