/**
 * FlowBridge V21 §3/§7 — typed deliberation request + canonical decision object.
 *
 * The DeliberationResult is ADVISORY. It carries no calldata, no approval amount,
 * no transaction target and no ActionIntent. A `candidateOpportunityKind` is a
 * question for the V20 reconciler, never an answer.
 */
import type { CapabilityKind } from "./capabilityTypes";
import type { EvidenceClaim } from "./evidenceClaim";
import type { ClaimEdge } from "./contradictionGraph";
import type { ReconciledInsight } from "./insightReconciler";

/** §2 — bounded fan-out: at most this many external skills per deliberation. */
export const MAX_DELIBERATION_FANOUT = 3;
/** §2 — total wall-clock budget for all external calls in one deliberation. */
export const DELIBERATION_BUDGET_MS = 6_000;

export interface DeliberationRequest {
  requestId: string;
  /** Minimum question/context only (§3) — never the full transcript. */
  question: string;
  /** Capability kinds the model *requests*; the server still picks the skills. */
  requestedCapabilityKinds: readonly CapabilityKind[];
  /** Canonical context references (ids only, no economics). */
  canonicalContextRefs?: readonly string[];
  deadline: string;
}

export interface DeliberationSourceReport {
  skillId: string;
  provider: string;
  skillVersion: string;
  capabilityKind: CapabilityKind;
  resultClass: string;
  ok: boolean;
  latencyMs: number;
  freshness: string | null;
  cached: boolean;
  observedAt: string | null;
  claimCount: number;
  strippedFields: readonly string[];
  unsafeContentFlagged: boolean;
  degradedNotice: string | null;
}

export interface CanonicalOverride {
  field: string;
  providerValue: string | null;
  canonicalValue: string | null;
  note: string;
}

export type DeliberationStatus = "OK" | "DEGRADED" | "CANONICAL_ONLY" | "NO_EVIDENCE";

export interface DeliberationResult {
  requestId: string;
  status: DeliberationStatus;
  degraded: boolean;
  /** Sources the server actually selected (§2), and why others were excluded. */
  selectedSkills: readonly DeliberationSourceReport[];
  excludedSkills: readonly { skillId: string; reason: string }[];
  /** Client-named skills the server refused to honour (§2/§12). */
  rejectedClientSkillIds: readonly string[];
  comparedSourceCount: number;
  claims: readonly EvidenceClaim[];
  edges: readonly ClaimEdge[];
  supportingEvidenceIds: readonly string[];
  contradictionIds: readonly string[];
  unresolvedQuestions: readonly string[];
  canonicalOverrides: readonly CanonicalOverride[];
  recommendationSummary: string;
  /** Advisory only; must pass the V20 reconciler before any V16 publication. */
  candidateOpportunityKind: string | null;
  /** Result of the canonical reconciliation, when a candidate emerged. */
  reconciliation: ReconciledInsight | null;
  freshness: { oldestObservedAt: string | null; newestObservedAt: string | null };
  /** Structural invariants for the acceptance report (§15). */
  executed: false;
  directExternalActionIntents: 0;
  missionsCreated: 0;
  blockchainTransactions: 0;
}
