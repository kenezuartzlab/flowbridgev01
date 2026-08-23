/**
 * FlowBridge V19 §1/§3/§4 — BOT Chain AI skill federation: type vocabulary.
 *
 * Boundary (non-negotiable): an external skill is an UNTRUSTED capability
 * provider. It may return information, rankings, candidate parameters and
 * evidence references. It may never sign, submit, approve, claim, stake, swap,
 * bridge, publish, mutate admin state, write FlowBridge economic records, or
 * create an ActionIntent. Nothing in this module carries write authority, and
 * no type here can be converted into calldata.
 */

/** Every federated skill is untrusted. There is no other trust class in V19. */
export type SkillTrustClass = "UNTRUSTED_EXTERNAL";

/**
 * Strict, read-only capability classes (V19 §3). There is deliberately NO
 * generic "arbitrary tool" class and no execution-capable class.
 */
export const CAPABILITY_KINDS = [
  "MARKET_READ",
  "TOKEN_METADATA_READ",
  "PROTOCOL_READ",
  "RISK_READ",
  "ROUTE_RESEARCH",
  "NEWS_OR_CONTEXT_READ",
  "GENERAL_ANALYSIS",
] as const;

export type CapabilityKind = (typeof CAPABILITY_KINDS)[number];

export function isCapabilityKind(v: unknown): v is CapabilityKind {
  return typeof v === "string" && (CAPABILITY_KINDS as readonly string[]).includes(v);
}

/** Result classes recorded in bounded telemetry (V19 §11). */
export type CapabilityResultClass =
  | "OK"
  | "SANITIZED"
  | "SCHEMA_REJECTED"
  | "SIZE_REJECTED"
  | "TIMEOUT"
  | "PROVIDER_ERROR"
  | "DISABLED"
  | "UNKNOWN_SKILL"
  | "RATE_LIMITED"
  | "CIRCUIT_OPEN"
  | "CAPABILITY_NOT_DECLARED";

/** Pseudonymous actor scope sent to a provider (V19 §4/§10). */
export interface FederationActorScope {
  /** Stable per-skill pseudonym. NEVER the internal user id or email. */
  pseudonymousActorRef: string | null;
  /** PUBLIC or AUTHENTICATED only — no org/operator detail leaves the server. */
  scope: "PUBLIC" | "AUTHENTICATED";
  /** Included only when the capability declares `requiresWalletAddress`. */
  walletAddress: string | null;
}

/** The single canonical outbound envelope (V19 §4). */
export interface CapabilityRequestEnvelope {
  requestId: string;
  skillId: string;
  skillVersion: string;
  capabilityKind: CapabilityKind;
  actor: FederationActorScope;
  /** Validated, minimized inputs. Never raw user text with credentials. */
  inputs: Readonly<Record<string, string | number | boolean | null>>;
  /** Absolute ISO deadline the provider must respect. */
  deadline: string;
  provenance: {
    origin: "flowbridge-server";
    adapterVersion: string;
  };
}

/** A single sanitized, non-economic finding from an external skill. */
export interface ExternalInsight {
  /** Bounded, sanitized human-readable label. */
  label: string;
  /** Bounded, sanitized detail text — advisory only. */
  detail: string;
  /** Optional non-authoritative reference URL (http/https only). */
  referenceUrl: string | null;
}

/**
 * Sanitized provider output. Note what is absent by design: no amounts, no
 * contract targets, no calldata, no chain ids, no fees. Those can only come
 * from FlowBridge canonical resolvers (V19 §6).
 */
export interface SanitizedCapabilityOutput {
  insights: readonly ExternalInsight[];
  /** Internal opportunity kind the provider *suggests*, unvalidated. */
  suggestedOpportunityKind: string | null;
  /** Fields the adapter stripped, for the evidence drawer + telemetry. */
  strippedFields: readonly string[];
  /** True when the payload contained instruction-injection or authority claims. */
  unsafeContentFlagged: boolean;
}

/** Provider provenance, always shown separately from canonical evidence. */
export interface ExternalEvidenceProvenance {
  provider: string;
  skillId: string;
  skillVersion: string;
  requestId: string;
  observedAt: string;
  freshness: "REALTIME" | "DAILY" | "SLOW" | "STATIC";
  /** Non-canonical by construction. Never upgraded. */
  authority: "EXTERNAL_UNTRUSTED";
  /** Set when this output came from the declared-safe TTL cache. */
  cached: boolean;
  cacheExpiresAt: string | null;
}

export interface CapabilityCallResult {
  ok: boolean;
  resultClass: CapabilityResultClass;
  /** Present only when ok. */
  output: SanitizedCapabilityOutput | null;
  provenance: ExternalEvidenceProvenance | null;
  latencyMs: number;
  /** User-safe explanation when not ok (honest degradation, never fabrication). */
  degradedNotice: string | null;
  /** Always false. External skills never execute anything. */
  executed: false;
  /** Always false. Only V17/V18 + explicit user authorization create intents. */
  createdActionIntent: false;
}
