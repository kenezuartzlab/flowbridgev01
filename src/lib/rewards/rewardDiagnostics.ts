/**
 * Reward-processing diagnostic outcomes (pure). Economic processing failures
 * must never be swallowed silently; every non-credit path maps to one outcome.
 */
export const REWARD_DIAGNOSTIC_OUTCOMES = [
  "PERSISTENCE_REJECTED",
  "UNSUPPORTED_RECORD_TYPE",
  "VALUATION_UNAVAILABLE",
  "CANONICAL_EVENT_MISSING",
  "DUPLICATE",
  "ANTI_ABUSE_REVIEW",
  "RETRY_SCHEDULED",
  "PERMANENT_FAILURE",
  "CREDITED",
] as const;
export type RewardDiagnosticOutcome = (typeof REWARD_DIAGNOSTIC_OUTCOMES)[number];

/** Map a database write error to a diagnostic outcome. */
export function classifyPersistenceError(error: { code?: string | null } | null | undefined): RewardDiagnosticOutcome | null {
  if (!error) return null;
  const code = String(error.code ?? "");
  if (code === "23505") return "DUPLICATE"; // unique canonical identity: never pay twice
  if (code === "23514" || code === "22P02") return "UNSUPPORTED_RECORD_TYPE"; // check / enum
  return "PERSISTENCE_REJECTED";
}

/** Outcomes that indicate a real failure (logged at error level). */
export function isFailureOutcome(o: RewardDiagnosticOutcome): boolean {
  return o === "PERSISTENCE_REJECTED" || o === "UNSUPPORTED_RECORD_TYPE" || o === "PERMANENT_FAILURE";
}

/** Strip anything sensitive-looking from a diagnostic detail string. */
export function sanitizeDiagnosticDetail(detail: string | undefined | null): string | null {
  if (!detail) return null;
  return String(detail)
    .replace(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g, "0x[address]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
    .slice(0, 300);
}
