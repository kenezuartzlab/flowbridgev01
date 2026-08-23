/**
 * FlowBridge V17.1C §2 — claim handoff correlation.
 *
 * A mission's prepared claim is reviewed and signed on `/earn`, not in chat. The
 * ONLY thing that travels in the link is opaque correlation (mission id, step id,
 * prepared intent id) so the claim surface can report the user's own submission
 * back to the mission. No economics, no calldata, no authority: `/earn` still
 * re-requests its own server-signed authorization and the user's wallet signs.
 *
 * Pure module.
 */
export interface ClaimHandoffCorrelation {
  missionId: string;
  stepId: string;
  intentId: string | null;
}

export const CLAIM_HANDOFF_KEYS = {
  mission: "mission",
  step: "mstep",
  intent: "intent",
} as const;

const OPAQUE_ID = /^[A-Za-z0-9:_-]{1,64}$/;

export function buildClaimHandoffSearch(
  correlation: ClaimHandoffCorrelation,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (OPAQUE_ID.test(correlation.missionId)) out[CLAIM_HANDOFF_KEYS.mission] = correlation.missionId;
  if (OPAQUE_ID.test(correlation.stepId)) out[CLAIM_HANDOFF_KEYS.step] = correlation.stepId;
  if (correlation.intentId && OPAQUE_ID.test(correlation.intentId)) {
    out[CLAIM_HANDOFF_KEYS.intent] = correlation.intentId;
  }
  return out;
}

/** Parses a correlation out of a query string. Missing/malformed → null. */
export function parseClaimHandoffCorrelation(search: string): ClaimHandoffCorrelation | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  } catch {
    return null;
  }
  const missionId = (params.get(CLAIM_HANDOFF_KEYS.mission) ?? "").trim();
  const stepId = (params.get(CLAIM_HANDOFF_KEYS.step) ?? "").trim();
  const intentId = (params.get(CLAIM_HANDOFF_KEYS.intent) ?? "").trim();
  if (!OPAQUE_ID.test(missionId) || !OPAQUE_ID.test(stepId)) return null;
  return {
    missionId,
    stepId,
    intentId: OPAQUE_ID.test(intentId) ? intentId : null,
  };
}
