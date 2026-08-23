/**
 * FlowBridge V21 §2/§9/§11 — SERVER-OWNED deliberation router.
 *
 * The client (and the model) may only request capability KINDS. The server picks
 * the actual skills from the V19 allowlist, applies bounded fan-out, honours
 * kill-switch/rate-limit/circuit state, runs the calls in parallel inside one
 * latency budget, then hands the sanitized results to the pure deliberator and
 * — only if a candidate emerged — to the V20 canonical reconciler.
 *
 * Nothing here writes: no mission, no ActionIntent, no economic record.
 */
import type { FlowAiActor } from "../aiTypes";
import { callCapability } from "./capabilityAdapter.server";
import { toCandidateInsight } from "./candidateInsight";
import {
  DELIBERATION_BUDGET_MS,
  MAX_DELIBERATION_FANOUT,
  type DeliberationResult,
  type DeliberationSourceReport,
} from "./deliberationTypes";
import { deliberate } from "./deliberator";
import { normalizeSkillResult, type EvidenceClaim } from "./evidenceClaim";
import { reconcileFederatedInsight } from "./insightReconciler.server";
import { isCapabilityKind, type CapabilityKind } from "./capabilityTypes";
import {
  FEDERATED_SKILLS,
  isFederationGloballyEnabled,
  isSkillRoutable,
} from "./skillFederationRegistry";
import type { MockScenarioControls } from "./mockBotSkill.server";

/**
 * §11 — per-actor deliberation cache. The key includes the actor id so one
 * actor's deliberation can never be served to another.
 */
const DELIBERATION_CACHE_TTL_MS = 30_000;
const deliberationCache = new Map<string, { expiresAt: number; result: DeliberationResult }>();

export function deliberationCacheKey(input: {
  actorId: string | null;
  walletAddress?: string | null;
  question: string;
  kinds: readonly string[];
}): string {
  return [
    `actor:${input.actorId ?? "anonymous"}`,
    `wallet:${(input.walletAddress ?? "none").toLowerCase()}`,
    `kinds:${[...input.kinds].sort().join("+")}`,
    `q:${input.question.trim().toLowerCase().slice(0, 200)}`,
  ].join("|");
}

export function resetDeliberationCache(): void {
  deliberationCache.clear();
}

/** §2 — routing decision: which approved skills answer this deliberation. */
export function routeDeliberation(input: {
  requestedCapabilityKinds: readonly string[];
  /** Client-named skills. Advisory at best; unroutable ones are rejected. */
  clientSkillIds?: readonly string[];
  env?: Record<string, string | undefined>;
}): {
  selected: { skillId: string; capabilityKind: CapabilityKind }[];
  excluded: { skillId: string; reason: string }[];
  rejectedClientSkillIds: string[];
} {
  const kinds = input.requestedCapabilityKinds.filter(isCapabilityKind);
  const excluded: { skillId: string; reason: string }[] = [];
  const selected: { skillId: string; capabilityKind: CapabilityKind }[] = [];
  const rejectedClientSkillIds: string[] = [];

  for (const id of input.clientSkillIds ?? []) {
    if (!isSkillRoutable(id, input.env)) rejectedClientSkillIds.push(id);
  }

  if (!isFederationGloballyEnabled(input.env)) {
    for (const s of FEDERATED_SKILLS) {
      excluded.push({ skillId: s.skillId, reason: "federation disabled for this deployment" });
    }
    return { selected, excluded, rejectedClientSkillIds };
  }

  for (const skill of FEDERATED_SKILLS) {
    const match = skill.capabilities.find((c) => kinds.includes(c.kind));
    if (!match) {
      excluded.push({ skillId: skill.skillId, reason: "does not declare a requested capability" });
      continue;
    }
    if (!skill.enabled) {
      excluded.push({ skillId: skill.skillId, reason: "skill disabled" });
      continue;
    }
    if (selected.length >= MAX_DELIBERATION_FANOUT) {
      excluded.push({ skillId: skill.skillId, reason: "fan-out budget reached" });
      continue;
    }
    selected.push({ skillId: skill.skillId, capabilityKind: match.kind });
  }

  return { selected, excluded, rejectedClientSkillIds };
}

export interface RunDeliberationInput {
  actor: FlowAiActor;
  question: string;
  requestedCapabilityKinds: readonly string[];
  clientSkillIds?: readonly string[];
  requestId: string;
  walletAddress?: string | null;
  /** Test-only deterministic provider behaviour, per skill id. */
  mockControls?: Record<string, MockScenarioControls>;
  now?: Date;
  env?: Record<string, string | undefined>;
  useCache?: boolean;
}

export async function runDeliberation(input: RunDeliberationInput): Promise<DeliberationResult> {
  const now = input.now ?? new Date();
  const cacheKey = deliberationCacheKey({
    actorId: input.actor.userId,
    walletAddress: input.walletAddress,
    question: input.question,
    kinds: input.requestedCapabilityKinds,
  });
  if (input.useCache !== false) {
    const hit = deliberationCache.get(cacheKey);
    if (hit && hit.expiresAt > now.getTime()) return hit.result;
  }

  const routed = routeDeliberation({
    requestedCapabilityKinds: input.requestedCapabilityKinds,
    clientSkillIds: input.clientSkillIds,
    env: input.env,
  });

  const budgetDeadline = now.getTime() + DELIBERATION_BUDGET_MS;

  /** §3 — each skill receives ONLY its minimal scoped input. */
  const calls = routed.selected.map(async (target) => {
    const skill = FEDERATED_SKILLS.find((s) => s.skillId === target.skillId)!;
    const capability = skill.capabilities.find((c) => c.kind === target.capabilityKind)!;
    const slot = capability.inputSlots.find((s) => s.required) ?? capability.inputSlots[0];
    const inputs: Record<string, unknown> = slot
      ? { [slot.name]: input.question.slice(0, slot.maxLength ?? 200) }
      : {};

    const result = await callCapability({
      skillId: skill.skillId,
      capabilityKind: target.capabilityKind,
      inputs,
      actor: { userId: input.actor.userId, walletAddress: input.walletAddress ?? null },
      requestId: `${input.requestId}:${skill.skillId}`,
      mockControls: input.mockControls?.[skill.skillId],
      env: input.env,
    });
    return { skill, capabilityKind: target.capabilityKind, result };
  });

  const settled = await Promise.all(calls);
  const overBudget = Date.now() > budgetDeadline;

  const claims: EvidenceClaim[] = [];
  const reports: DeliberationSourceReport[] = [];

  for (const { skill, capabilityKind, result } of settled) {
    const usable = result.ok && !!result.output && !!result.provenance && !overBudget;
    const produced =
      usable && result.output && result.provenance
        ? normalizeSkillResult({
            output: result.output,
            provenance: result.provenance,
            question: input.question,
            now,
          })
        : [];
    claims.push(...produced);
    reports.push({
      skillId: skill.skillId,
      provider: skill.provider,
      skillVersion: skill.version,
      capabilityKind,
      resultClass: overBudget && result.ok ? "TIMEOUT" : result.resultClass,
      ok: usable,
      latencyMs: result.latencyMs,
      freshness: result.provenance?.freshness ?? null,
      cached: result.provenance?.cached ?? false,
      observedAt: result.provenance?.observedAt ?? null,
      claimCount: produced.length,
      strippedFields: result.output?.strippedFields ?? [],
      unsafeContentFlagged: result.output?.unsafeContentFlagged ?? false,
      degradedNotice:
        overBudget && result.ok
          ? "This source answered after the deliberation budget, so it was dropped."
          : result.degradedNotice,
    });
  }

  const base = deliberate({
    requestId: input.requestId,
    question: input.question,
    claims,
    selectedSkills: reports,
    excludedSkills: routed.excluded,
    rejectedClientSkillIds: routed.rejectedClientSkillIds,
    anySourceFailed: reports.some((r) => !r.ok),
  });

  /**
   * §7/§10 — a candidate kind is only a QUESTION. The V20 reconciler re-reads
   * canonical state for this authenticated actor and decides everything.
   */
  let reconciliation: DeliberationResult["reconciliation"] = null;
  if (base.candidateOpportunityKind && input.actor.userId) {
    const supportingClaims = claims.filter((c) =>
      base.supportingEvidenceIds.includes(c.id),
    );
    const lead = supportingClaims[0];
    if (lead) {
      const candidate = toCandidateInsight({
        output: {
          insights: supportingClaims.map((c) => ({
            label: `${c.provider}`,
            detail: c.statement,
            referenceUrl: c.referenceUrl,
          })),
          suggestedOpportunityKind: base.candidateOpportunityKind,
          strippedFields: [...new Set(supportingClaims.flatMap((c) => [...c.strippedFields]))],
          unsafeContentFlagged: supportingClaims.some((c) => c.unsafeContentFlagged),
        },
        provenance: {
          provider: lead.provider,
          skillId: lead.skillId,
          skillVersion: lead.skillVersion,
          requestId: lead.requestId,
          observedAt: lead.observedAt,
          freshness: "SLOW",
          authority: "EXTERNAL_UNTRUSTED",
          cached: lead.cached,
          cacheExpiresAt: null,
        },
      });
      reconciliation = await reconcileFederatedInsight({
        actor: input.actor,
        candidate,
        now,
      });
    }
  }

  const result: DeliberationResult = { ...base, reconciliation };
  if (input.useCache !== false) {
    deliberationCache.set(cacheKey, {
      expiresAt: now.getTime() + DELIBERATION_CACHE_TTL_MS,
      result,
    });
  }
  return result;
}
