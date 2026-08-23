/**
 * FlowBridge V20 §1/§2/§3/§4/§5 — the federated-insight reconciler (PURE).
 *
 * This is the ONLY bridge from a V19 sanitized CandidateInsight to a canonical
 * V16 opportunity identity, and it works by LOOKUP, never by construction:
 *
 *  - It accepts a sanitized CandidateInsight only. Raw provider output cannot
 *    reach it (the adapter is the only producer of CandidateInsight).
 *  - It never copies an external token, amount, APY, fee, contract, allowance
 *    or reward into an opportunity. It matches the *suggested kind* against an
 *    allowlist and then returns the canonical opportunity the FlowBridge V16
 *    engine already resolved for this actor. If canonical state does not prove
 *    the suggestion, nothing actionable is produced.
 *  - Federated evidence freshness is tracked separately from V16 opportunity
 *    freshness (§9): expired external evidence can never be shown as current.
 *  - Building a mission remains an explicit user action (§7); this module makes
 *    zero mission rows and no ActionIntent.
 */
import type { CandidateInsight } from "./candidateInsight";
import {
  opportunityKind,
  opportunitySupportsMission,
  templateForOpportunity,
} from "../opportunity/missionTemplates";
import type { OpportunityDomain, RankedOpportunity } from "../opportunity/opportunityTypes";

export const RECONCILIATION_STATUSES = [
  "ACCEPTED_CANONICAL",
  "CONTRADICTED",
  "STALE",
  "UNSUPPORTED",
  "DEGRADED",
] as const;

export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

/** §4 — federated insights may only map into these V16 opportunity kinds. */
export const FEDERATION_OPPORTUNITY_KIND_ALLOWLIST = [
  "REWARDS:CLAIM_FLOW",
  "STAKING:START_STAKING",
] as const;

/** §9 — external evidence TTL, independent of V16 opportunity staleness. */
export const FEDERATED_EVIDENCE_TTL_MS = 10 * 60_000;

export interface ReconciliationContradiction {
  field: string;
  providerValue: string | null;
  canonicalValue: string | null;
  note: string;
}

export interface ReconciledInsight {
  status: ReconciliationStatus;
  /** Canonical V16 opportunity — the ONLY actionable identity (§6). */
  opportunity: RankedOpportunity | null;
  opportunityId: string | null;
  opportunityKind: string | null;
  /** §7 — true only when a canonical opportunity + supported template exist. */
  buildMissionAvailable: boolean;
  templateId: string | null;
  /** §8 — slots the user must still supply; never inferred from the skill. */
  unresolvedSlots: readonly string[];
  /** §5 — provider claims that canonical state overrode, as evidence metadata. */
  contradictions: readonly ReconciliationContradiction[];
  /** Canonical evidence ids the reconciliation actually re-read (§2). */
  canonicalEvidenceIds: readonly string[];
  /** Provider provenance, persisted separately from canonical evidence (§2). */
  externalProvenance: CandidateInsight["provenance"];
  /** Sanitized advisory text, always labelled EXTERNAL in the UI. */
  insights: CandidateInsight["insights"];
  externalEvidenceExpired: boolean;
  externalEvidenceExpiresAt: string;
  explanation: string;
  /** Structural invariants for the acceptance report (§14). */
  executed: false;
  actionIntentsCreatedBySkill: 0;
  missionsCreated: 0;
}

const DOMAIN_OF_KIND: Record<string, OpportunityDomain> = {
  "REWARDS:CLAIM_FLOW": "REWARDS",
  "STAKING:START_STAKING": "STAKING",
};

function kindAllowlisted(kind: string): boolean {
  return (FEDERATION_OPPORTUNITY_KIND_ALLOWLIST as readonly string[]).includes(kind);
}

/**
 * §3/§5 — every stripped provider field is recorded as a contradiction note so
 * the evidence drawer can show "the skill claimed X; FlowBridge used canonical".
 */
function contradictionsFromStrippedFields(
  candidate: CandidateInsight,
  canonical: RankedOpportunity | null,
): ReconciliationContradiction[] {
  return candidate.discardedProviderFields.map((field) => {
    const canonicalValue =
      canonical && field in canonical.economicSnapshot
        ? String(canonical.economicSnapshot[field] ?? "")
        : null;
    return {
      field,
      providerValue: null,
      canonicalValue,
      note: canonicalValue
        ? `The skill tried to establish "${field}". FlowBridge discarded it and used its canonical value ${canonicalValue}.`
        : `The skill tried to establish "${field}". FlowBridge discarded it; only canonical FlowBridge state can set it.`,
    };
  });
}

export function reconcileCandidateInsight(input: {
  candidate: CandidateInsight;
  /** Canonical V16 feed items, re-resolved server-side for THIS actor. */
  canonicalItems: readonly RankedOpportunity[];
  degradedDomains: readonly OpportunityDomain[];
  stakingAvailable: boolean;
  now?: Date;
  evidenceTtlMs?: number;
}): ReconciledInsight {
  const now = input.now ?? new Date();
  const candidate = input.candidate;
  const ttl = input.evidenceTtlMs ?? FEDERATED_EVIDENCE_TTL_MS;

  const observedAt = new Date(candidate.provenance.observedAt).getTime();
  const expiresAtMs = (Number.isFinite(observedAt) ? observedAt : 0) + ttl;
  const externalEvidenceExpired = expiresAtMs <= now.getTime();
  const externalEvidenceExpiresAt = new Date(expiresAtMs).toISOString();

  const base = {
    opportunity: null,
    opportunityId: null,
    opportunityKind: null,
    buildMissionAvailable: false,
    templateId: null,
    unresolvedSlots: [] as readonly string[],
    canonicalEvidenceIds: [] as readonly string[],
    externalProvenance: candidate.provenance,
    insights: candidate.insights,
    externalEvidenceExpired,
    externalEvidenceExpiresAt,
    executed: false as const,
    actionIntentsCreatedBySkill: 0 as const,
    missionsCreated: 0 as const,
  };

  const suggested = candidate.mappedOpportunityKind
    ? candidate.mappedOpportunityKind.toUpperCase()
    : null;

  /** §4 — unknown/unsupported suggestion stays explanation-only. */
  if (!suggested || !kindAllowlisted(suggested) || candidate.explanationOnly) {
    return {
      ...base,
      status: "UNSUPPORTED",
      contradictions: contradictionsFromStrippedFields(candidate, null),
      explanation:
        candidate.explanationOnlyReason ??
        "This external insight does not map to a FlowBridge opportunity FlowBridge can prove, so it stays informational.",
    };
  }

  /** §9 — expired external evidence can never be presented as current. */
  if (externalEvidenceExpired) {
    return {
      ...base,
      status: "STALE",
      contradictions: contradictionsFromStrippedFields(candidate, null),
      explanation:
        "This external insight is older than FlowBridge allows for external evidence, so it is shown as expired rather than current. Your FlowBridge data is unaffected.",
    };
  }

  const domain = DOMAIN_OF_KIND[suggested];
  if (domain && input.degradedDomains.includes(domain)) {
    return {
      ...base,
      status: "DEGRADED",
      contradictions: contradictionsFromStrippedFields(candidate, null),
      explanation:
        "FlowBridge could not independently re-read the canonical state this insight refers to, so nothing actionable was published. Existing canonical opportunities are unaffected.",
    };
  }

  const canonical =
    input.canonicalItems.find((i) => opportunityKind(i) === suggested) ?? null;

  /** §3/§5 — no canonical proof ⇒ no actionable opportunity, ever. */
  if (!canonical) {
    return {
      ...base,
      status: "CONTRADICTED",
      contradictions: [
        ...contradictionsFromStrippedFields(candidate, null),
        {
          field: "opportunityKind",
          providerValue: suggested,
          canonicalValue: null,
          note: `The skill suggested ${suggested}, but your canonical FlowBridge state does not currently support it, so no actionable opportunity was created.`,
        },
      ],
      explanation:
        "FlowBridge re-read your live state and could not confirm this suggestion, so it is shown as external context only.",
    };
  }

  /** §9 — the canonical opportunity has its own freshness window. */
  if (new Date(canonical.staleAfter).getTime() <= now.getTime()) {
    return {
      ...base,
      status: "STALE",
      contradictions: contradictionsFromStrippedFields(candidate, canonical),
      explanation:
        "The canonical opportunity behind this insight needs re-resolution before it can be acted on. Refresh your insights to see what is current.",
    };
  }

  const template = templateForOpportunity({
    domain: canonical.domain,
    type: canonical.type,
    stakingAvailable: input.stakingAvailable,
  });
  const supported = opportunitySupportsMission(canonical) && !!template;

  return {
    ...base,
    status: "ACCEPTED_CANONICAL",
    opportunity: canonical,
    opportunityId: canonical.id,
    opportunityKind: suggested,
    buildMissionAvailable: supported,
    templateId: template?.id ?? null,
    unresolvedSlots: template?.requiresUserInput ?? [],
    canonicalEvidenceIds: canonical.evidenceRefs.map((e) => e.id),
    contradictions: contradictionsFromStrippedFields(candidate, canonical),
    explanation: supported
      ? "External insight, verified by FlowBridge: the numbers, target and amounts come from your canonical FlowBridge state. You still build and sign everything yourself."
      : "FlowBridge confirmed the underlying state, but this opportunity has no supported mission template, so it stays explanation-only.",
  };
}
