/**
 * FlowBridge V20 §12 — deterministic reconciliation tests.
 *
 * These prove the boundary: an external skill can contribute a *suggestion*, but
 * only canonical FlowBridge state can produce an actionable opportunity, and no
 * external amount, fee or contract may become an executable input.
 */
import { describe, expect, it } from "vitest";
import { toCandidateInsight } from "./candidateInsight";
import { sanitizeCapabilityOutput } from "./outputSanitizer";
import {
  FEDERATED_EVIDENCE_TTL_MS,
  reconcileCandidateInsight,
} from "./insightReconciler";
import type { ExternalEvidenceProvenance } from "./capabilityTypes";
import type { RankedOpportunity } from "../opportunity/opportunityTypes";

const NOW = new Date("2026-08-23T12:00:00.000Z");

function provenance(observedAt = NOW.toISOString()): ExternalEvidenceProvenance {
  return {
    provider: "BOT Chain Mock Research Agent",
    skillId: "bot.mock.research",
    skillVersion: "1.0.0",
    requestId: "req-1",
    observedAt,
    freshness: "DAILY",
    authority: "EXTERNAL_UNTRUSTED",
    cached: false,
    cacheExpiresAt: null,
  };
}

function candidateFrom(raw: unknown, observedAt?: string) {
  const output = sanitizeCapabilityOutput(raw);
  if (!output.ok || !output.value) throw new Error("sanitizer rejected fixture");
  return toCandidateInsight({ output: output.value, provenance: provenance(observedAt) });
}

const stakingOpportunity: RankedOpportunity = {
  id: "opp_staking_start",
  type: "START_STAKING",
  domain: "STAKING",
  actorScope: "PUBLIC",
  title: "Stake FLOW in the vault",
  reason: "The vault is accepting stakes.",
  priority: "MEDIUM",
  reasonCodes: ["STAKE_AVAILABLE"],
  provenance: "LIVE",
  confidence: "VERIFIED",
  createdAt: NOW.toISOString(),
  staleAfter: new Date(NOW.getTime() + 180_000).toISOString(),
  expiresAt: null,
  evidenceRefs: [
    {
      id: "chain.staking.vault",
      label: "Live vault read",
      dataClass: "CHAIN_READ",
      authority: "AUTHORITATIVE_STATE",
      freshness: "REALTIME",
      observedAt: NOW.toISOString(),
      value: { minStakeFlow: 10, feeBps: 0 },
      excerpt: "Live vault parameters.",
    } as any,
  ],
  economicSnapshot: { minStakeFlow: 10, feeBps: 0, chainId: 8899 },
  containsPrivateEvidence: false,
  recommendedSurface: { label: "Stake", href: "/stake" },
  preparableAction: null,
  score: 10,
  scoreReasons: [],
};

const safeStakingRaw = {
  insights: [
    { label: "BOT staking context", detail: "Vault participation is rising this week." },
  ],
  suggestedOpportunityKind: "STAKING:START_STAKING",
};

function reconcile(candidate: ReturnType<typeof candidateFrom>, over: Partial<Parameters<typeof reconcileCandidateInsight>[0]> = {}) {
  return reconcileCandidateInsight({
    candidate,
    canonicalItems: [stakingOpportunity],
    degradedDomains: [],
    stakingAvailable: true,
    now: NOW,
    ...over,
  });
}

describe("V20 federated insight reconciliation", () => {
  it("publishes a canonical opportunity for a safe supported insight", () => {
    const r = reconcile(candidateFrom(safeStakingRaw));
    expect(r.status).toBe("ACCEPTED_CANONICAL");
    expect(r.opportunityId).toBe("opp_staking_start");
    expect(r.buildMissionAvailable).toBe(true);
    expect(r.templateId).toBe("STAKE_FLOW");
    expect(r.canonicalEvidenceIds).toContain("chain.staking.vault");
    expect(r.missionsCreated).toBe(0);
    expect(r.executed).toBe(false);
  });

  it("never lets a fake external amount become an executable input", () => {
    const candidate = candidateFrom({ ...safeStakingRaw, amount: "750", missionAmount: 750 });
    const r = reconcile(candidate);
    expect(r.status).toBe("ACCEPTED_CANONICAL");
    expect(JSON.stringify(r.opportunity?.economicSnapshot)).not.toContain("750");
    expect(r.contradictions.some((c) => c.field === "amount")).toBe(true);
    /** STAKE_FLOW still demands the user's own amount (§8). */
    expect(r.unresolvedSlots).toContain("amount");
  });

  it("discards a fake contract target instead of making it actionable", () => {
    const candidate = candidateFrom({
      ...safeStakingRaw,
      contractAddress: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    });
    const r = reconcile(candidate);
    expect(JSON.stringify(r)).not.toContain("0xdeadbeef");
    expect(r.contradictions.some((c) => c.field === "contractAddress")).toBe(true);
  });

  it("keeps the canonical fee when the provider contradicts it", () => {
    const r = reconcile(candidateFrom({ ...safeStakingRaw, feeBps: 100 }));
    expect(r.opportunity?.economicSnapshot["feeBps"]).toBe(0);
    const note = r.contradictions.find((c) => c.field === "feeBps");
    expect(note?.canonicalValue).toBe("0");
  });

  it("keeps an unsupported insight explanation-only", () => {
    const r = reconcile(
      candidateFrom({ ...safeStakingRaw, suggestedOpportunityKind: "TRADE:MEV_SNIPE" }),
    );
    expect(r.status).toBe("UNSUPPORTED");
    expect(r.buildMissionAvailable).toBe(false);
    expect(r.opportunityId).toBeNull();
  });

  it("reports DEGRADED without touching canonical opportunities", () => {
    const r = reconcile(candidateFrom(safeStakingRaw), { degradedDomains: ["STAKING"] });
    expect(r.status).toBe("DEGRADED");
    expect(r.buildMissionAvailable).toBe(false);
  });

  it("marks expired external evidence STALE rather than current", () => {
    const old = new Date(NOW.getTime() - FEDERATED_EVIDENCE_TTL_MS - 1_000).toISOString();
    const r = reconcile(candidateFrom(safeStakingRaw, old));
    expect(r.status).toBe("STALE");
    expect(r.externalEvidenceExpired).toBe(true);
    expect(r.buildMissionAvailable).toBe(false);
  });

  it("refuses to invent an opportunity canonical state does not prove", () => {
    const r = reconcile(candidateFrom(safeStakingRaw), { canonicalItems: [] });
    expect(r.status).toBe("CONTRADICTED");
    expect(r.opportunityId).toBeNull();
    expect(r.contradictions.some((c) => c.field === "opportunityKind")).toBe(true);
  });

  it("creates zero missions and zero action intents in every path", () => {
    for (const raw of [safeStakingRaw, { ...safeStakingRaw, suggestedOpportunityKind: null }]) {
      const r = reconcile(candidateFrom(raw));
      expect(r.missionsCreated).toBe(0);
      expect(r.actionIntentsCreatedBySkill).toBe(0);
      expect(r.executed).toBe(false);
    }
  });
});
