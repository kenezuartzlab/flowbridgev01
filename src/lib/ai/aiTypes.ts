/**
 * FlowBridge V15 — Flow AI Intelligence Fabric: core type vocabulary.
 *
 * Governing principle (from the V15 gate): intelligence may be probabilistic,
 * authority is deterministic. Nothing in this fabric may sign, mutate economics,
 * publish campaigns or hold keys. Every skill declares `writeAuthority: false`
 * and the orchestrator refuses to route a skill that claims otherwise.
 */

/** Retrieval mode selected per request by the orchestrator. */
export type FlowAiMode = "OFFLINE" | "ONLINE" | "HYBRID";

/**
 * Classes of data a skill may touch. Used both for scope enforcement and for
 * the user-facing evidence drawer grouping.
 */
export type DataClass =
  | "FLOWBRIDGE_KNOWLEDGE" // versioned product docs/config snapshots (offline safe)
  | "FLOWBRIDGE_DB" // authoritative app database, scoped to the caller
  | "ON_CHAIN" // RPC/contract reads
  | "EXPLORER" // BOT explorer evidence
  | "BOT_OFFICIAL" // official BOT Chain docs/announcements
  | "PARTNER_SOURCE" // partner/project supplied, untrusted text
  | "WEB_SOURCE" // approved web search
  | "USER_MEMORY"; // opt-in user memory

/** Which authority tier a piece of evidence came from. Drives precedence. */
export type SourceAuthority =
  | "AUTHORITATIVE_STATE" // app DB / on-chain reads — outranks prose
  | "OFFICIAL_DOCS" // BOT Chain official docs/announcements
  | "PRODUCT_DOCS" // FlowBridge own docs/config snapshots
  | "PROJECT_SOURCE" // third-party project's own claim
  | "COMMUNITY_SOURCE" // community/third party
  | "MODEL_MEMORY"; // lowest: never sufficient on its own

/** How fresh a fact must be / is. */
export type FreshnessClass =
  | "REALTIME" // must be read now (balances, prices, tx status)
  | "DAILY" // changes often but caching for hours is fine
  | "SLOW" // policies, deployed addresses
  | "STATIC"; // chain ids, schemas, immutable history

/** User-facing confidence language. Deliberately not a percentage. */
export type ConfidenceLabel = "VERIFIED" | "CURRENT" | "ESTIMATED" | "STALE" | "UNAVAILABLE";

/** Memory visibility scopes — never crossed. */
export type MemoryScope =
  | "SESSION"
  | "USER_PRIVATE"
  | "PARTNER_ORG_PRIVATE"
  | "FLOWBRIDGE_GLOBAL"
  | "PUBLIC_BOT_ECOSYSTEM";

/** Caller identity resolved by the SERVER before any private retrieval. */
export interface FlowAiActor {
  userId: string | null;
  email: string | null;
  /** Partner org memberships resolved server-side (never model-decided). */
  orgIds: readonly string[];
  isInternalOperator: boolean;
}

export const ANONYMOUS_ACTOR: FlowAiActor = {
  userId: null,
  email: null,
  orgIds: [],
  isInternalOperator: false,
};

/** Scopes a skill may require before the orchestrator will route to it. */
export type FlowAiScope =
  | "PUBLIC"
  | "AUTHENTICATED_USER"
  | "PARTNER_ORG_MEMBER"
  | "INTERNAL_OPERATOR";

/** A single retrieved evidence item attached to an answer. */
export interface EvidenceItem {
  id: string;
  label: string;
  dataClass: DataClass;
  authority: SourceAuthority;
  freshness: FreshnessClass;
  /** ISO timestamp the value was observed. */
  observedAt: string;
  /** Optional link shown in the evidence drawer. */
  url?: string;
  /** Structured value used for deterministic math — never free-text numbers. */
  value?: unknown;
  /** Short excerpt for prose sources. */
  excerpt?: string;
}

/** Availability of a BOT Chain compatibility adapter. */
export type AdapterAvailability =
  | "unavailable"
  | "announced"
  | "testnet"
  | "mainnet"
  | "degraded";
