/**
 * V15 §6 — Evidence Verifier.
 *
 * Runs after specialists retrieve and before an answer is returned. It checks
 * that dynamic claims are backed by evidence, detects staleness and conflicts,
 * and LOWERS confidence rather than inventing an answer.
 */
import type { ConfidenceLabel, EvidenceItem, FlowAiMode } from "./aiTypes";
import { asOfTimestamp, isStale, resolveConflict } from "./sourcePrecedence";

export interface VerificationInput {
  question: string;
  mode: FlowAiMode;
  evidence: readonly EvidenceItem[];
  /** True when the question needs live state (balances, prices, tx status). */
  requiresLiveState: boolean;
  now?: Date;
}

export interface VerificationResult {
  confidence: ConfidenceLabel;
  asOf: string | null;
  staleEvidenceIds: readonly string[];
  conflicts: readonly string[];
  /** Sentence prepended/appended to the answer when evidence is insufficient. */
  disclosure: string | null;
  /** True when the fabric must refuse to state a live fact. */
  mustDeclineLiveFact: boolean;
  sourceGroups: readonly { dataClass: string; count: number }[];
}

const LIVE_FACT_PATTERN =
  /\b(price|balance|apy|apr|rate|pending|confirmed|status|claimable|how much|current)\b/i;

export function requiresLiveState(question: string): boolean {
  return LIVE_FACT_PATTERN.test(question);
}

export function verifyAnswer(input: VerificationInput): VerificationResult {
  const now = input.now ?? new Date();
  const evidence = input.evidence;
  const stale = evidence.filter((e) => isStale(e, now));
  const asOf = asOfTimestamp(evidence);

  // Group same-question evidence by entity-ish key to spot contradictions.
  const byKey = new Map<string, EvidenceItem[]>();
  for (const e of evidence) {
    const key = `${e.label}::${e.freshness}`;
    const bucket = byKey.get(keyOf(e)) ?? [];
    bucket.push(e);
    byKey.set(keyOf(e) || key, bucket);
  }
  const conflicts: string[] = [];
  for (const bucket of byKey.values()) {
    if (bucket.length < 2) continue;
    const resolution = resolveConflict(bucket, now);
    if (resolution?.conflicted && resolution.note) conflicts.push(resolution.note);
  }

  const hasAuthoritative = evidence.some(
    (e) => e.authority === "AUTHORITATIVE_STATE" || e.dataClass === "ON_CHAIN",
  );
  const liveNeeded = input.requiresLiveState;
  const offline = input.mode === "OFFLINE";

  let confidence: ConfidenceLabel;
  let disclosure: string | null = null;
  let mustDeclineLiveFact = false;

  if (evidence.length === 0) {
    confidence = "UNAVAILABLE";
    disclosure =
      "I don't have evidence for that yet. Tell me what to look at — a transaction hash, a page, or sign in so I can read your FlowBridge data.";
    mustDeclineLiveFact = liveNeeded;
  } else if (liveNeeded && offline) {
    confidence = "UNAVAILABLE";
    mustDeclineLiveFact = true;
    disclosure = `Live data isn't reachable right now, so I won't guess. Here's what my cached FlowBridge knowledge says${
      asOf ? ` (as of ${asOf})` : ""
    }.`;
  } else if (liveNeeded && !hasAuthoritative) {
    confidence = "ESTIMATED";
    disclosure =
      "This is based on product policy rather than a live read — check the page that shows the live value to confirm.";
  } else if (stale.length > 0 && stale.length === evidence.length) {
    confidence = "STALE";
    disclosure = asOf ? `Cached information, as of ${asOf}.` : "Cached information.";
  } else if (hasAuthoritative && liveNeeded) {
    confidence = "VERIFIED";
  } else if (offline) {
    confidence = "STALE";
    disclosure = asOf ? `Answered from cached FlowBridge knowledge, as of ${asOf}.` : null;
  } else {
    confidence = "CURRENT";
  }

  if (conflicts.length > 0) {
    disclosure = [disclosure, conflicts[0]].filter(Boolean).join(" ");
  }

  const groups = new Map<string, number>();
  for (const e of evidence) groups.set(e.dataClass, (groups.get(e.dataClass) ?? 0) + 1);

  return {
    confidence,
    asOf,
    staleEvidenceIds: stale.map((s) => s.id),
    conflicts,
    disclosure,
    mustDeclineLiveFact,
    sourceGroups: [...groups.entries()].map(([dataClass, count]) => ({ dataClass, count })),
  };
}

function keyOf(e: EvidenceItem): string {
  return e.id.split("@")[0];
}

/** Human labels for the evidence drawer. */
export const DATA_CLASS_LABEL: Record<string, string> = {
  FLOWBRIDGE_KNOWLEDGE: "FlowBridge docs",
  FLOWBRIDGE_DB: "FlowBridge data",
  ON_CHAIN: "On-chain",
  EXPLORER: "BOT explorer",
  BOT_OFFICIAL: "BOT Chain official",
  PARTNER_SOURCE: "Partner source",
  WEB_SOURCE: "Web source",
  USER_MEMORY: "Your saved preferences",
};

export const CONFIDENCE_LABEL: Record<ConfidenceLabel, string> = {
  VERIFIED: "Verified",
  CURRENT: "Current",
  ESTIMATED: "Estimated",
  STALE: "Stale",
  UNAVAILABLE: "Unavailable",
};
