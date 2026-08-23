/**
 * FlowBridge V21 §5 — bounded support/contradiction graph across EvidenceClaims.
 *
 * Rules that must never regress:
 *  - No external skill adjudicates another skill's claim; relations are derived
 *    structurally by FlowBridge, not asked of a provider.
 *  - Material disagreement is SURFACED, never averaged into a midpoint.
 */
import type { EvidenceClaim } from "./evidenceClaim";

export type ClaimRelation = "SUPPORTS" | "CONTRADICTS" | "INDEPENDENT" | "UNRESOLVED";

export interface ClaimEdge {
  id: string;
  fromClaimId: string;
  toClaimId: string;
  relation: ClaimRelation;
  reason: string;
}

/** Bound the graph so a hostile fan-out cannot blow up comparison cost. */
export const MAX_GRAPH_EDGES = 64;

export function buildContradictionGraph(claims: readonly EvidenceClaim[]): ClaimEdge[] {
  const edges: ClaimEdge[] = [];
  for (let i = 0; i < claims.length; i += 1) {
    for (let j = i + 1; j < claims.length; j += 1) {
      if (edges.length >= MAX_GRAPH_EDGES) return edges;
      const a = claims[i];
      const b = claims[j];
      if (a.skillId === b.skillId) continue;

      let relation: ClaimRelation = "INDEPENDENT";
      let reason = "Different subjects — the sources are not talking about the same thing.";

      const bothSuggestions =
        a.claimKind === "OPPORTUNITY_SUGGESTION" && b.claimKind === "OPPORTUNITY_SUGGESTION";

      if (bothSuggestions && a.subject === b.subject) {
        relation = "SUPPORTS";
        reason = `${a.provider} and ${b.provider} independently point at ${a.subject}.`;
      } else if (bothSuggestions) {
        relation = "CONTRADICTS";
        reason = `${a.provider} suggests ${a.subject} while ${b.provider} suggests ${b.subject}; FlowBridge canonical state decides.`;
      } else if (a.subject === b.subject) {
        relation = a.expired || b.expired ? "UNRESOLVED" : "SUPPORTS";
        reason =
          a.expired || b.expired
            ? "The sources overlap but one has expired evidence, so agreement can't be established."
            : `${a.provider} and ${b.provider} report overlapping context.`;
      }

      if (relation !== "CONTRADICTS" && (a.unsafeContentFlagged || b.unsafeContentFlagged)) {
        relation = "CONTRADICTS";
        reason =
          "One source returned unsafe or instruction-like content, so its agreement is not counted.";
      }

      edges.push({
        id: `${a.id}->${b.id}`,
        fromClaimId: a.id,
        toClaimId: b.id,
        relation,
        reason,
      });
    }
  }
  return edges;
}

/** Support weight per subject, using server-owned quality scores only (§6). */
export function subjectSupport(
  claims: readonly EvidenceClaim[],
): { subject: string; claimIds: string[]; skillIds: string[]; weight: number }[] {
  const map = new Map<string, { claimIds: string[]; skillIds: Set<string>; weight: number }>();
  for (const c of claims) {
    if (c.claimKind !== "OPPORTUNITY_SUGGESTION" || c.expired) continue;
    const entry = map.get(c.subject) ?? { claimIds: [], skillIds: new Set<string>(), weight: 0 };
    entry.claimIds.push(c.id);
    entry.skillIds.add(c.skillId);
    entry.weight += c.qualityScore;
    map.set(c.subject, entry);
  }
  return [...map.entries()]
    .map(([subject, e]) => ({
      subject,
      claimIds: e.claimIds,
      skillIds: [...e.skillIds],
      weight: Number(e.weight.toFixed(3)),
    }))
    .sort((a, b) => b.weight - a.weight || a.subject.localeCompare(b.subject));
}
