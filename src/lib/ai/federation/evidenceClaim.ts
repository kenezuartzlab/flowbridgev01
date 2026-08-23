/**
 * FlowBridge V21 §4/§6 — normalized EvidenceClaim schema + server-owned scoring.
 *
 * Every accepted provider result (already sanitized by V19) is converted into a
 * common claim shape so claims from different skills can be COMPARED. Nothing
 * here can carry economics: the sanitizer stripped them before this module runs,
 * and a claim has no amount, target, chain or calldata field at all.
 *
 * Quality scoring is owned entirely by FlowBridge. A provider may report a
 * `confidenceHint`, but it is metadata only and never feeds the score.
 */
import type {
  ExternalEvidenceProvenance,
  SanitizedCapabilityOutput,
} from "./capabilityTypes";

export type ClaimKind = "OPPORTUNITY_SUGGESTION" | "CONTEXT" | "RISK_NOTE";

export type EvidenceSourceClass = "EXTERNAL_UNTRUSTED" | "FLOWBRIDGE_CANONICAL";

export interface EvidenceClaim {
  id: string;
  /** Normalized comparison key: an opportunity kind, or a topic slug. */
  subject: string;
  claimKind: ClaimKind;
  /** Bounded advisory text. Never an amount, address or instruction. */
  statement: string;
  /** Provider-declared confidence. Metadata only — never trusted (§4). */
  confidenceHint: number | null;
  observedAt: string;
  expiresAt: string;
  provider: string;
  skillId: string;
  skillVersion: string;
  requestId: string;
  sourceClass: EvidenceSourceClass;
  referenceUrl: string | null;
  cached: boolean;
  unsafeContentFlagged: boolean;
  /** Economic fields this provider tried to establish and lost (§6/V19). */
  strippedFields: readonly string[];
  /** Server-computed 0..1 ranking weight (§6). */
  qualityScore: number;
  expired: boolean;
}

/** Default external-claim TTL — mirrors V20's federated evidence window. */
export const CLAIM_TTL_MS = 10 * 60_000;

const FRESHNESS_WEIGHT: Record<ExternalEvidenceProvenance["freshness"], number> = {
  REALTIME: 1,
  DAILY: 0.8,
  SLOW: 0.55,
  STATIC: 0.4,
};

/**
 * §6 — canonical evidence always outranks external evidence. External claims are
 * hard-capped below the canonical floor so no amount of provider agreement can
 * ever outrank FlowBridge state.
 */
export const EXTERNAL_SCORE_CEILING = 0.7;
export const CANONICAL_SCORE_FLOOR = 0.9;

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

function directness(statement: string, question: string): number {
  const words = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3);
  if (words.length === 0) return 0.5;
  const hay = statement.toLowerCase();
  const hits = words.filter((w) => hay.includes(w)).length;
  return Math.min(1, hits / Math.min(words.length, 6));
}

export function scoreExternalClaim(input: {
  freshness: ExternalEvidenceProvenance["freshness"];
  hasReference: boolean;
  statement: string;
  question: string;
  cached: boolean;
  unsafeContentFlagged: boolean;
  strippedFieldCount: number;
  expired: boolean;
}): number {
  if (input.expired) return 0;
  let score = FRESHNESS_WEIGHT[input.freshness] * 0.5;
  score += (input.hasReference ? 0.1 : 0) + 0.1; // schema completeness
  score += directness(input.statement, input.question) * 0.3;
  if (input.cached) score -= 0.05;
  if (input.unsafeContentFlagged) score -= 0.25;
  if (input.strippedFieldCount > 0) score -= 0.1;
  return Math.max(0, Math.min(EXTERNAL_SCORE_CEILING, Number(score.toFixed(3))));
}

/** §4 — one sanitized skill result becomes 0..n comparable claims. */
export function normalizeSkillResult(input: {
  output: SanitizedCapabilityOutput;
  provenance: ExternalEvidenceProvenance;
  question: string;
  now?: Date;
  ttlMs?: number;
}): EvidenceClaim[] {
  const now = input.now ?? new Date();
  const ttl = input.ttlMs ?? CLAIM_TTL_MS;
  const observedMs = new Date(input.provenance.observedAt).getTime();
  const baseMs = Number.isFinite(observedMs) ? observedMs : now.getTime();
  const expiresAt = new Date(baseMs + ttl);
  const expired = expiresAt.getTime() <= now.getTime();
  const suggestion = input.output.suggestedOpportunityKind
    ? input.output.suggestedOpportunityKind.toUpperCase()
    : null;

  return input.output.insights.map((insight, index) => {
    const claimKind: ClaimKind =
      index === 0 && suggestion
        ? "OPPORTUNITY_SUGGESTION"
        : /risk|unsafe|warn|urgent|scam/i.test(insight.label)
          ? "RISK_NOTE"
          : "CONTEXT";
    const statement = `${insight.label} — ${insight.detail}`;
    return {
      id: `${input.provenance.skillId}#${index}`,
      subject:
        claimKind === "OPPORTUNITY_SUGGESTION" && suggestion
          ? suggestion
          : slug(insight.label) || "general-context",
      claimKind,
      statement,
      confidenceHint: null,
      observedAt: input.provenance.observedAt,
      expiresAt: expiresAt.toISOString(),
      provider: input.provenance.provider,
      skillId: input.provenance.skillId,
      skillVersion: input.provenance.skillVersion,
      requestId: input.provenance.requestId,
      sourceClass: "EXTERNAL_UNTRUSTED",
      referenceUrl: insight.referenceUrl,
      cached: input.provenance.cached,
      unsafeContentFlagged: input.output.unsafeContentFlagged,
      strippedFields: input.output.strippedFields,
      qualityScore: scoreExternalClaim({
        freshness: input.provenance.freshness,
        hasReference: !!insight.referenceUrl,
        statement,
        question: input.question,
        cached: input.provenance.cached,
        unsafeContentFlagged: input.output.unsafeContentFlagged,
        strippedFieldCount: input.output.strippedFields.length,
        expired,
      }),
      expired,
    };
  });
}
