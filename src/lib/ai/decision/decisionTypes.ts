/**
 * FlowBridge V22 §1/§4 — typed contract for the Personalized Decision Engine.
 *
 * The decision engine may RANK, EXPLAIN and SUPPRESS. It may never manufacture
 * economics, infer a missing transaction amount, create a Mission, or bypass the
 * frozen V15.3/V17 wallet-authorization path. Every economic value that reaches
 * this layer is copied verbatim from a canonical V16 opportunity snapshot.
 */
import type { EvidenceItem } from "../aiTypes";
import type {
  OpportunityDomain,
  OpportunityProvenance,
  RankedOpportunity,
} from "../opportunity/opportunityTypes";
import type { MissionOutcome, MissionStatus } from "../mission/missionTypes";

export const DECISION_SCHEMA_VERSION = "flowbridge.decision/1" as const;
export const DECISION_POLICY_VERSION = "V22" as const;

/** Default primary items in "For you now" (V22 §8). */
export const DECISION_DEFAULT_LIMIT = 3;

/** V22 §4 — machine-readable, inspectable rank reasons. */
export const DECISION_REASON_CODES = [
  "CONTINUE_ACTIVE_MISSION",
  "READY_TO_CLAIM",
  "IDLE_FLOW_AVAILABLE",
  "PREREQUISITE_FOR_STAKING",
  "ACTIVE_MISSION_BLOCKER",
  "TIME_SENSITIVE",
  "CANONICAL_FRESH_EVIDENCE",
  "RECENTLY_COMPLETED_SIMILAR",
  "USER_PREFERS_STAKING",
  "USER_PREFERS_LOW_INTERACTION",
  "STALE_OR_LOW_CONFIDENCE",
  "DUPLICATE_OF_ACTIVE_MISSION",
  "EQUIVALENT_ACTION_GROUPED",
  "DISMISSED_BY_USER",
  "SNOOZED_BY_USER",
  "REPEAT_SUPPRESSED",
  "BLOCKED_PREREQUISITE",
  "NOT_ACTIONABLE_INFORMATIONAL",
] as const;

export type DecisionReasonCode = (typeof DECISION_REASON_CODES)[number];

export type DecisionItemKind = "CONTINUE_MISSION" | "OPPORTUNITY";

/** Read-only mission context. Mission history is immutable here (V22 §10). */
export interface DecisionMissionContext {
  id: string;
  status: MissionStatus;
  goalText: string;
  outcome: MissionOutcome;
  /** Domains this mission already addresses — drives duplicate suppression. */
  domains: readonly OpportunityDomain[];
  currentStepTitle: string | null;
  currentStepRequiresWallet: boolean;
  blockingReason: string | null;
  completedAt: string | null;
  updatedAt: string;
  percent: number;
}

/**
 * V22 §3/§6 — opt-in preference SIGNALS only. No amounts, contracts, fees or
 * transaction parameters may ever be represented here.
 */
export interface DecisionPreferences {
  optedIn: boolean;
  prefersStaking: boolean;
  prefersRewards: boolean;
  prefersLowInteraction: boolean;
  /** Preference keys actually used, for inspectable provenance. */
  usedKeys: readonly string[];
  /** Preference keys that looked economic and were deliberately ignored. */
  ignoredEconomicKeys: readonly string[];
}

export const EMPTY_PREFERENCES: DecisionPreferences = {
  optedIn: false,
  prefersStaking: false,
  prefersRewards: false,
  prefersLowInteraction: false,
  usedKeys: [],
  ignoredEconomicKeys: [],
};

/** One explanation fact, copied verbatim from canonical evidence/snapshot. */
export interface DecisionFact {
  label: string;
  value: string;
  source: "CANONICAL_SNAPSHOT" | "MISSION_STATE" | "PRESENTATION_STATE";
}

export interface DecisionItem {
  kind: DecisionItemKind;
  /** Stable key: the canonical opportunity id, or `mission:<id>`. */
  id: string;
  opportunityId: string | null;
  missionId: string | null;
  rank: number;
  score: number;
  scoreParts: readonly string[];
  reasonCodes: readonly DecisionReasonCode[];
  title: string;
  /** What is this? */
  what: string;
  /** Why is it relevant to me now? */
  whyNow: string;
  /** What happens if I continue? */
  whatNext: string;
  requiresWalletConfirmation: boolean;
  actionable: boolean;
  blocked: boolean;
  blockerText: string | null;
  domain: OpportunityDomain | null;
  provenance: OpportunityProvenance;
  expiresAt: string | null;
  containsPrivateEvidence: boolean;
  freshness: string;
  surface: { label: string; href: string };
  facts: readonly DecisionFact[];
  evidenceRefs: readonly EvidenceItem[];
  /** Only meaningful for OPPORTUNITY items; Build Mission stays explicit. */
  supportsMission: boolean;
}

export interface DecisionSuppressedItem {
  id: string;
  title: string;
  reasonCodes: readonly DecisionReasonCode[];
  explanation: string;
}

export interface DecisionResult {
  schemaVersion: typeof DECISION_SCHEMA_VERSION;
  policyVersion: typeof DECISION_POLICY_VERSION;
  requestId: string;
  actorScopes: readonly string[];
  generatedAt: string;
  /** Oldest freshness class among the canonical evidence actually used. */
  evidenceFreshness: readonly string[];
  items: readonly DecisionItem[];
  suppressed: readonly DecisionSuppressedItem[];
  memoryUsed: boolean;
  preferenceKeysUsed: readonly string[];
  activeMissionIds: readonly string[];
  completedMissionCount: number;
  degradedDomains: readonly OpportunityDomain[];
  status: "OK" | "DEGRADED" | "NOTHING_ACTIONABLE";
  /** Honest, non-fabricated copy when nothing is actionable (V22 §9). */
  notice: string | null;
  /** Constants: this layer can never execute or author economics. */
  executed: false;
  createdActionIntent: false;
  missionsCreated: 0;
}

export interface DecisionEngineInput {
  requestId: string;
  actorScopes: readonly string[];
  opportunities: readonly RankedOpportunity[];
  missions: readonly DecisionMissionContext[];
  preferences: DecisionPreferences;
  viewStates: readonly { key: string; lastSeenAt?: string | null; dismissedAt?: string | null; snoozedUntil?: string | null }[];
  degradedDomains: readonly OpportunityDomain[];
  limit?: number;
  now?: Date;
}
