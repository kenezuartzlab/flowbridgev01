/**
 * FlowBridge V23 §1/§4/§5 — typed contract for Simulation + Scenario Intelligence.
 *
 * A ScenarioSet is ADVISORY PREVIEW ONLY. It may compare safe canonical paths
 * and show current-snapshot estimates, but it may never:
 *  - create a Mission, ActionIntent, approval, signature or transaction;
 *  - become executable state (no scenario field is transaction evidence);
 *  - freeze or prefill a downstream amount — V17 still derives the staked
 *    amount from the actually verified claim settlement.
 *
 * Every meaningful number carries a value class so the UI can never present a
 * preview estimate as a canonical fact.
 */
import type { EvidenceItem } from "../aiTypes";
import type { OpportunityDomain } from "../opportunity/opportunityTypes";
import type { MissionTemplateId } from "../opportunity/missionTemplates";

export const SCENARIO_SCHEMA_VERSION = "flowbridge.scenario/1" as const;
export const SCENARIO_POLICY_VERSION = "V23" as const;

/** §3 — narrow, proven primitives only. No free-form transaction simulator. */
export const SCENARIO_KINDS = [
  "CONTINUE_MISSION",
  "NO_ACTION",
  "CLAIM_ONLY",
  "CLAIM_THEN_STAKE_PERCENT",
  "STAKE_EXISTING_FLOW",
] as const;
export type ScenarioKind = (typeof SCENARIO_KINDS)[number];

/** §5 — exact vs estimated vs unknowable-until-settlement. */
export type ScenarioValueClass =
  | "CANONICAL_EXACT"
  | "DERIVED_PREVIEW"
  | "UNKNOWN_UNTIL_SETTLEMENT";

export interface ScenarioFact {
  label: string;
  value: string;
  unit: string | null;
  valueClass: ScenarioValueClass;
  /** Where the number came from. Never a model, never the client. */
  source: "CANONICAL_SNAPSHOT" | "DETERMINISTIC_PREVIEW" | "MISSION_STATE" | "NOT_AVAILABLE";
}

/** §7 — bounded planning inputs. Never transaction authorization. */
export interface ScenarioPlanningInputs {
  /** 25 / 50 / 100 only. */
  stakePercent: 25 | 50 | 100 | null;
  /** Preview-only FLOW amount for STAKE_EXISTING_FLOW. */
  previewStakeFlow: number | null;
  /** True when a preference such as "stake half" pre-selected the percent. */
  preSelectedFromMemory: boolean;
  /** Client fields that were rejected as economic input (§7). */
  rejectedClientFields: readonly string[];
}

export const EMPTY_PLANNING_INPUTS: ScenarioPlanningInputs = {
  stakePercent: null,
  previewStakeFlow: null,
  preSelectedFromMemory: false,
  rejectedClientFields: [],
};

/** §2 — canonical, server-resolved snapshot. The client can never supply this. */
export interface CanonicalScenarioSnapshot {
  /** Deterministic id over the canonical fields — drives §11 invalidation. */
  snapshotId: string;
  observedAt: string;
  freshness: string;
  provenance: "LIVE" | "CACHED" | "DEGRADED";
  boundWallet: string | null;
  chainId: number | null;
  vault: string | null;
  stakingAvailable: boolean;
  /** Canonical exact values at snapshot time, or null when not resolvable. */
  claimableFlow: number | null;
  stakedFlow: number | null;
  earnedFlow: number | null;
  minStakeFlow: number | null;
  /** Opportunity kinds (`DOMAIN:TYPE`) currently supported by V16/V18/V17. */
  supportedOpportunityKinds: readonly string[];
  degradedDomains: readonly OpportunityDomain[];
  evidenceRefs: readonly EvidenceItem[];
}

export interface ScenarioResult {
  scenarioId: string;
  scenarioKind: ScenarioKind;
  label: string;
  /** Deterministic order within the set — lower comes first. */
  order: number;
  /** Plain-language "what changes?" */
  whatChanges: string;
  /** "What stays liquid?" */
  liquidityNote: string;
  canonicalSnapshotId: string;
  freshness: string;
  prerequisites: readonly string[];
  exactFacts: readonly ScenarioFact[];
  estimatedFacts: readonly ScenarioFact[];
  assumptions: readonly string[];
  userPlanningInputs: ScenarioPlanningInputs;
  /** Values that CANNOT be known until canonical settlement (§5/§6). */
  unresolvedExecutionValues: readonly string[];
  expectedWalletConfirmations: number;
  expectedWalletConfirmationLabels: readonly string[];
  expectedStateChanges: readonly string[];
  blockers: readonly string[];
  /** The template a later explicit Build Mission would compile from (§10). */
  candidateMissionTemplate: {
    templateId: MissionTemplateId;
    opportunityKind: string;
    /** Always false here: selecting a scenario authorizes nothing. */
    authorized: false;
  } | null;
  missionId: string | null;
  /** True only when the underlying canonical action is currently supported. */
  supported: boolean;
  /** Explanation-only paths carry no Build Mission affordance. */
  explanationOnly: boolean;
  evidenceRefs: readonly EvidenceItem[];
}

export interface ScenarioSet {
  schemaVersion: typeof SCENARIO_SCHEMA_VERSION;
  policyVersion: typeof SCENARIO_POLICY_VERSION;
  requestId: string;
  actorScopes: readonly string[];
  generatedAt: string;
  snapshot: CanonicalScenarioSnapshot;
  scenarios: readonly ScenarioResult[];
  planningInputs: ScenarioPlanningInputs;
  /** Which scenario reads best for the stated goal — never an opaque score. */
  recommendedScenarioId: string | null;
  recommendationReason: string | null;
  /** §9 — an active mission covering the same action replaced a scenario. */
  activeMissionIds: readonly string[];
  suppressedScenarioKinds: readonly ScenarioKind[];
  /** §11 — set when canonical inputs changed since the open comparison. */
  stale: boolean;
  staleReason: string | null;
  status: "OK" | "DEGRADED" | "NOTHING_TO_COMPARE";
  notice: string | null;
  memoryUsed: boolean;
  /** Constants: this layer is economically inert. */
  executed: false;
  createdMissions: 0;
  createdActionIntents: 0;
}
