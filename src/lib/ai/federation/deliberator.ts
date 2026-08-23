/**
 * FlowBridge V21 §5/§6/§7/§10 — the PURE deliberator.
 *
 * Given normalized claims (already sanitized by V19) it produces one advisory
 * recommendation plus an inspectable support/contradiction map. It cannot reach
 * the network, cannot read the database and cannot construct economics: the
 * strongest thing it can emit is a *candidate* opportunity kind, which the V20
 * reconciler must independently prove against canonical state.
 */
import { buildContradictionGraph, subjectSupport, type ClaimEdge } from "./contradictionGraph";
import type { EvidenceClaim } from "./evidenceClaim";
import type {
  CanonicalOverride,
  DeliberationResult,
  DeliberationSourceReport,
  DeliberationStatus,
} from "./deliberationTypes";

export function overridesFromClaims(claims: readonly EvidenceClaim[]): CanonicalOverride[] {
  const seen = new Set<string>();
  const out: CanonicalOverride[] = [];
  for (const c of claims) {
    for (const field of c.strippedFields) {
      const key = `${c.skillId}::${field}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        field,
        providerValue: null,
        canonicalValue: null,
        note: `${c.provider} tried to establish "${field}". FlowBridge discarded it — only canonical FlowBridge state can set it.`,
      });
    }
  }
  return out;
}

/** True when the edge joins two *different* opportunity suggestions (§5). */
function contradictingSuggestions(claims: readonly EvidenceClaim[], edge: ClaimEdge): boolean {
  const a = claims.find((c) => c.id === edge.fromClaimId);
  const b = claims.find((c) => c.id === edge.toClaimId);
  return (
    !!a &&
    !!b &&
    a.claimKind === "OPPORTUNITY_SUGGESTION" &&
    b.claimKind === "OPPORTUNITY_SUGGESTION" &&
    a.subject !== b.subject
  );
}

export function deliberate(input: {
  requestId: string;
  question: string;
  claims: readonly EvidenceClaim[];
  selectedSkills: readonly DeliberationSourceReport[];
  excludedSkills: readonly { skillId: string; reason: string }[];
  rejectedClientSkillIds: readonly string[];
  /** True when at least one selected skill failed/timed out (§9). */
  anySourceFailed: boolean;
}): Omit<DeliberationResult, "reconciliation"> {
  const claims = input.claims;
  const edges: ClaimEdge[] = buildContradictionGraph(claims);
  const support = subjectSupport(claims);

  const contradictionIds = edges.filter((e) => e.relation === "CONTRADICTS").map((e) => e.id);
  const unresolvedEdges = edges.filter((e) => e.relation === "UNRESOLVED");

  const okSources = input.selectedSkills.filter((s) => s.ok);
  const comparedSourceCount = okSources.length;

  const top = support[0] ?? null;
  const runnerUp = support[1] ?? null;
  /** §5/§10 — a contested subject is surfaced, never blended or auto-promoted. */
  const suggestionConflict = edges.some(
    (e) => e.relation === "CONTRADICTS" && contradictingSuggestions(claims, e),
  );
  const contested =
    suggestionConflict || !!(top && runnerUp && runnerUp.weight >= top.weight * 0.75);

  const candidateOpportunityKind = top && !contested ? top.subject : null;

  const supportingEvidenceIds = top && !contested ? top.claimIds : [];

  const unresolvedQuestions: string[] = [];
  if (contested && top && runnerUp) {
    unresolvedQuestions.push(
      `Sources disagree on what to do next (${top.subject} vs ${runnerUp.subject}). FlowBridge will not pick one from external agreement alone.`,
    );
  }
  for (const e of edges) {
    if (e.relation === "CONTRADICTS" && !unresolvedQuestions.includes(e.reason)) {
      unresolvedQuestions.push(e.reason);
    }
  }
  for (const e of unresolvedEdges) unresolvedQuestions.push(e.reason);
  if (input.anySourceFailed) {
    const missing = input.selectedSkills.filter((s) => !s.ok).map((s) => s.provider);
    unresolvedQuestions.push(
      `Not every source answered in time (${missing.join(", ") || "unknown source"}), so this comparison is incomplete.`,
    );
  }

  const status: DeliberationStatus =
    comparedSourceCount === 0
      ? input.selectedSkills.length === 0
        ? "NO_EVIDENCE"
        : "CANONICAL_ONLY"
      : input.anySourceFailed
        ? "DEGRADED"
        : "OK";

  const canonicalOverrides = overridesFromClaims(claims);

  const summary =
    status === "NO_EVIDENCE"
      ? "No approved BOT Chain skill was available for this question, so FlowBridge answered from its own canonical state only."
      : status === "CANONICAL_ONLY"
        ? "Every external source failed, so nothing external was used. FlowBridge canonical state is unaffected and remains the only basis for anything actionable."
        : contested
          ? `Compared ${comparedSourceCount} sources: they disagree, so FlowBridge is showing the disagreement instead of guessing. Nothing actionable was published from external agreement.`
          : top
            ? `Compared ${comparedSourceCount} sources: ${top.skillIds.length > 1 ? "they agree" : "one source suggests"} this relates to ${top.subject}. FlowBridge must re-read your live state before it becomes actionable, and every amount and target stays canonical.`
            : `Compared ${comparedSourceCount} sources: useful context only, with no FlowBridge opportunity to plan from.`;

  const observed = claims.map((c) => c.observedAt).sort();

  return {
    requestId: input.requestId,
    status,
    degraded: status === "DEGRADED" || status === "CANONICAL_ONLY",
    selectedSkills: input.selectedSkills,
    excludedSkills: input.excludedSkills,
    rejectedClientSkillIds: input.rejectedClientSkillIds,
    comparedSourceCount,
    claims,
    edges,
    supportingEvidenceIds,
    contradictionIds,
    unresolvedQuestions,
    canonicalOverrides,
    recommendationSummary: summary,
    candidateOpportunityKind,
    freshness: {
      oldestObservedAt: observed[0] ?? null,
      newestObservedAt: observed[observed.length - 1] ?? null,
    },
    executed: false,
    directExternalActionIntents: 0,
    missionsCreated: 0,
    blockchainTransactions: 0,
  };
}
