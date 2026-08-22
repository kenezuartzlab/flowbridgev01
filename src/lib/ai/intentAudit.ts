/**
 * V15.2 §10 — ActionIntent observability.
 *
 * Audits preparation decisions without logging reasoning, keys, tokens or full
 * payloads. Amounts are recorded as coarse magnitudes; addresses are truncated.
 */
import type { ActionIntent } from "./actionIntent";
import type { PolicyEvaluation } from "./intentPolicy";

const short = (a: string | null | undefined) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : null);

export interface ActionIntentAudit {
  kind: "flow-ai.action-intent";
  intentId: string;
  type: ActionIntent["type"];
  chainId: number;
  policyVersion: string;
  simulationMethod: string | null;
  simulationOk: boolean | null;
  decision: PolicyEvaluation["decision"];
  finalStatus: ActionIntent["status"];
  /** Never executed: hard-coded, and asserted by tests. */
  executed: false;
  blockerCount: number;
  blockerCodes: readonly string[];
  riskFlagCount: number;
  missingEvidence: readonly string[];
  evidenceRefs: readonly string[];
  handoffTarget: string | null;
  actorPresent: boolean;
  walletShort: string | null;
  orgPresent: boolean;
  at: string;
}

export function buildIntentAudit(input: {
  intent: ActionIntent;
  evaluation: PolicyEvaluation;
  handoffTarget: string | null;
  at?: Date;
}): ActionIntentAudit {
  return {
    kind: "flow-ai.action-intent",
    intentId: input.intent.id,
    type: input.intent.type,
    chainId: input.intent.chainId,
    policyVersion: input.intent.policyVersion,
    simulationMethod: input.intent.simulationResult?.method ?? null,
    simulationOk: input.intent.simulationResult?.ok ?? null,
    decision: input.evaluation.decision,
    finalStatus: input.intent.status,
    executed: false,
    blockerCount: input.evaluation.blockers.length,
    blockerCodes: input.evaluation.blockers.map((b) => b.slice(0, 80)),
    riskFlagCount: input.evaluation.riskFlags.length,
    missingEvidence: input.evaluation.missingEvidence,
    evidenceRefs: input.intent.sourceEvidenceRefs,
    handoffTarget: input.handoffTarget,
    actorPresent: !!input.intent.actorUserId,
    walletShort: short(input.intent.actorWallet),
    orgPresent: !!input.intent.organizationId,
    at: (input.at ?? new Date()).toISOString(),
  };
}

export interface IntentMetrics {
  prepared: number;
  ready: number;
  rejected: number;
  expired: number;
  simulationFailures: Readonly<Record<string, number>>;
  revalidationFailures: number;
  externalSkillLatencyMs: readonly number[];
  degradedProviders: readonly string[];
  preparationSuccessRate: number;
  executed: 0;
}

/** Operator-safe rollup for /sets diagnostics. Grants no control to the AI. */
export function summarizeIntentAudits(audits: readonly ActionIntentAudit[]): IntentMetrics {
  const failures: Record<string, number> = {};
  let ready = 0;
  let rejected = 0;
  let expired = 0;
  let revalidationFailures = 0;

  for (const a of audits) {
    if (a.finalStatus === "READY_FOR_USER" || a.finalStatus === "HANDED_OFF") ready += 1;
    if (a.finalStatus === "REJECTED") rejected += 1;
    if (a.finalStatus === "EXPIRED") expired += 1;
    if (a.simulationOk === false) {
      const reason = a.blockerCodes[0] ?? "unknown";
      failures[reason] = (failures[reason] ?? 0) + 1;
    }
    if (a.blockerCodes.some((b) => /changed since|expired/i.test(b))) revalidationFailures += 1;
  }

  return {
    prepared: audits.length,
    ready,
    rejected,
    expired,
    simulationFailures: failures,
    revalidationFailures,
    externalSkillLatencyMs: [],
    degradedProviders: [],
    preparationSuccessRate: audits.length === 0 ? 0 : Number((ready / audits.length).toFixed(3)),
    executed: 0,
  };
}

export function logIntentAudit(audit: ActionIntentAudit): void {
  console.log("[flow-ai.intent]", JSON.stringify(audit));
}
