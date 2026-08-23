/**
 * FlowBridge V16 §2 — the ONE canonical Opportunity object.
 *
 * Rules baked into this module:
 *  - Every economic number in `economicSnapshot` must be traceable to an
 *    evidence ref produced by a canonical resolver (server ledger, live
 *    contract read, canonical campaign row). The model may re-order and
 *    re-phrase opportunities; it may never invent one or edit its numbers.
 *  - Identity is deterministic so the same condition cannot appear twice
 *    across Home, Earn and the Assistant.
 *  - Nothing here executes anything. `preparableAction` only points back at
 *    the frozen V15.3 ActionIntent pipeline.
 */
import type { ConfidenceLabel, EvidenceItem, FlowAiScope } from "../aiTypes";

export type OpportunityDomain =
  | "REWARDS"
  | "STAKING"
  | "CAMPAIGNS"
  | "TRADE"
  | "WALLET"
  | "ECOSYSTEM";

/** Internal, transparent reason codes used by the deterministic ranker. */
export type OpportunityReasonCode =
  | "CLAIMABLE_VALUE"
  | "POINTS_ACCRUED"
  | "DAILY_CAP_HEADROOM"
  | "STAKE_AVAILABLE"
  | "STAKE_REWARD_AVAILABLE"
  | "CAMPAIGN_ELIGIBLE"
  | "CAMPAIGN_IN_PROGRESS"
  | "CAMPAIGN_ENDING_SOON"
  | "ACTION_EXPIRED"
  | "NETWORK_MISMATCH"
  | "NO_BOUND_WALLET"
  | "SOURCE_DEGRADED";

/** Per-opportunity source provenance, shown to the user verbatim. */
export type OpportunityProvenance = "LIVE" | "CACHED" | "DEGRADED";

export type OpportunityPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface OpportunitySurface {
  label: string;
  href: string;
}

/**
 * A bounded preparation entry point. V16 adds NO new execution authority: this
 * is handed to the existing V15.3 ActionIntent preparation path, which stops at
 * READY_FOR_USER and requires the user's own wallet.
 */
export interface OpportunityPreparableAction {
  type: "SWAP" | "STAKE" | "CLAIM";
  chainId: number;
  parameters: Record<string, unknown>;
  cta: string;
}

export interface Opportunity {
  /** Deterministic identity — see `opportunityIdentity`. */
  id: string;
  type: string;
  domain: OpportunityDomain;
  /** Minimum scope required to even see this opportunity. */
  actorScope: FlowAiScope;
  title: string;
  /** One concise sentence: why this matters now. */
  reason: string;
  priority: OpportunityPriority;
  reasonCodes: readonly OpportunityReasonCode[];
  provenance: OpportunityProvenance;
  confidence: ConfidenceLabel;
  createdAt: string;
  /** After this instant the opportunity must be re-resolved, not re-shown. */
  staleAfter: string;
  /** Real-world deadline (campaign end, prepared-action expiry) or null. */
  expiresAt: string | null;
  evidenceRefs: readonly EvidenceItem[];
  /** Canonical numbers only. Never model-authored. */
  economicSnapshot: Readonly<Record<string, number | string | null>>;
  /** True when any evidence is the caller's own private data. */
  containsPrivateEvidence: boolean;
  recommendedSurface: OpportunitySurface;
  preparableAction: OpportunityPreparableAction | null;
}

/** Ranked, presentation-ready opportunity. */
export interface RankedOpportunity extends Opportunity {
  score: number;
  scoreReasons: readonly string[];
}

/** Presentation-only state. Never touches economic state. */
export interface OpportunityViewState {
  key: string;
  lastSeenAt: string | null;
  dismissedAt: string | null;
  snoozedUntil: string | null;
}

export interface OpportunityFeed {
  generatedAt: string;
  actorScopes: readonly string[];
  items: readonly RankedOpportunity[];
  /** Domains that could not be resolved from canonical sources. */
  degradedDomains: readonly OpportunityDomain[];
}
