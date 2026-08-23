/**
 * FlowBridge V24 §4/§5 — one typed status vocabulary shared by every
 * intelligence surface, plus the fail-closed actionability gate.
 *
 * There is deliberately NO opaque universal "AI confidence score": every signal
 * exposed here has explicit semantics.
 */
export const INTELLIGENCE_STATUSES = [
  "OK",
  "DEGRADED",
  "STALE",
  "INSUFFICIENT_EVIDENCE",
  "CONFLICTED",
  "BLOCKED",
] as const;

export type IntelligenceStatus = (typeof INTELLIGENCE_STATUSES)[number];

/** Statuses that may never carry an actionable (wallet-preparable) item. */
const NON_ACTIONABLE: readonly IntelligenceStatus[] = [
  "STALE",
  "INSUFFICIENT_EVIDENCE",
  "BLOCKED",
];

/** §4 — actionability fails closed; read-only explanation stays available. */
export function allowsActionability(status: IntelligenceStatus): boolean {
  return !NON_ACTIONABLE.includes(status);
}

export function allowsReadOnlyExplanation(status: IntelligenceStatus): boolean {
  return status !== "BLOCKED";
}

export interface StatusInput {
  /** A layer kill switch is off, or a hard authority precondition failed. */
  blocked?: boolean;
  /** Required canonical evidence is missing entirely. */
  missingRequiredEvidence?: boolean;
  /** Canonical evidence exists but is past its freshness window. */
  stale?: boolean;
  /** Sources disagree and FlowBridge refuses to average them. */
  conflicted?: boolean;
  /** A non-essential source failed, or a domain is unavailable. */
  degraded?: boolean;
}

/**
 * Deterministic precedence: the most restrictive truthful status wins. A cleaner
 * recommendation is never a reason to hide conflict or staleness (§4).
 */
export function resolveIntelligenceStatus(input: StatusInput): IntelligenceStatus {
  if (input.blocked) return "BLOCKED";
  if (input.missingRequiredEvidence) return "INSUFFICIENT_EVIDENCE";
  if (input.stale) return "STALE";
  if (input.conflicted) return "CONFLICTED";
  if (input.degraded) return "DEGRADED";
  return "OK";
}

/** Honest, non-fabricating copy per status. Never invents activity. */
export function statusNotice(status: IntelligenceStatus, surface: string): string | null {
  switch (status) {
    case "BLOCKED":
      return `${surface} is turned off for this deployment. Your canonical FlowBridge state, missions and history are unaffected.`;
    case "INSUFFICIENT_EVIDENCE":
      return "FlowBridge does not have the canonical evidence it needs, so nothing is recommended and no values are estimated.";
    case "STALE":
      return "Canonical evidence for this view is stale. FlowBridge must refresh it before anything can be prepared.";
    case "CONFLICTED":
      return "Sources disagree. FlowBridge shows the disagreement instead of averaging it into a single answer.";
    case "DEGRADED":
      return "Some sources are unavailable, so they are omitted. Nothing is estimated in their place.";
    default:
      return null;
  }
}

/** Maps a legacy per-surface status onto the shared V24 vocabulary. */
export function normalizeLegacyStatus(raw: string): IntelligenceStatus {
  switch (raw) {
    case "OK":
      return "OK";
    case "DEGRADED":
      return "DEGRADED";
    case "STALE":
      return "STALE";
    case "CONFLICTED":
      return "CONFLICTED";
    case "BLOCKED":
      return "BLOCKED";
    case "NOTHING_ACTIONABLE":
    case "NOTHING_TO_COMPARE":
    case "NO_EVIDENCE":
    case "CANONICAL_ONLY":
      return "INSUFFICIENT_EVIDENCE";
    default:
      return "DEGRADED";
  }
}
