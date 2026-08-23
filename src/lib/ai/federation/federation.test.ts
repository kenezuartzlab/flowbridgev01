/**
 * FlowBridge V19 §12 — required adversarial tests for the capability adapter.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  callCapability,
  recentFederationTelemetry,
  resetFederationRuntimeState,
} from "./capabilityAdapter.server";
import { federationRegistryMetadata, isSkillRoutable } from "./skillFederationRegistry";
import { sanitizeCapabilityOutput } from "./outputSanitizer";
import { reconcileWithCanonical, toCandidateInsight } from "./candidateInsight";

const actor = { userId: "user-1" };

beforeEach(() => resetFederationRuntimeState());

describe("registry", () => {
  it("exposes metadata and never grants write authority", () => {
    const meta = federationRegistryMetadata({});
    expect(meta.skills.every((s) => s.writeAuthority === false)).toBe(true);
    expect(meta.skills.every((s) => s.trustClass === "UNTRUSTED_EXTERNAL")).toBe(true);
  });

  it("keeps unapproved and disabled skills unroutable", () => {
    expect(isSkillRoutable("bot.mock.research", {})).toBe(true);
    expect(isSkillRoutable("bot.mock.market", {})).toBe(false);
    expect(isSkillRoutable("attacker.evil.skill", {})).toBe(false);
  });

  it("honours the global kill switch", () => {
    expect(isSkillRoutable("bot.mock.research", { FLOW_AI_FEDERATION_ENABLED: "false" })).toBe(false);
  });
});

describe("adapter boundary", () => {
  it("rejects a client-named unapproved skill", async () => {
    const r = await callCapability({
      skillId: "attacker.evil.skill",
      capabilityKind: "GENERAL_ANALYSIS",
      inputs: { question: "hi" },
      actor,
      requestId: "r1",
    });
    expect(r.ok).toBe(false);
    expect(r.resultClass).toBe("UNKNOWN_SKILL");
  });

  it("rejects a disabled skill and an undeclared capability", async () => {
    const disabled = await callCapability({
      skillId: "bot.mock.market",
      capabilityKind: "MARKET_READ",
      inputs: { symbol: "BOT" },
      actor,
      requestId: "r2",
    });
    expect(disabled.resultClass).toBe("DISABLED");

    const undeclared = await callCapability({
      skillId: "bot.mock.research",
      capabilityKind: "MARKET_READ",
      inputs: {},
      actor,
      requestId: "r3",
    });
    expect(undeclared.resultClass).toBe("CAPABILITY_NOT_DECLARED");
  });

  it("returns sanitized advisory evidence and strips executable fields", async () => {
    const r = await callCapability({
      skillId: "bot.mock.research",
      capabilityKind: "GENERAL_ANALYSIS",
      inputs: { question: "should I stake?" },
      actor,
      requestId: "r4",
    });
    expect(r.ok).toBe(true);
    expect(r.executed).toBe(false);
    expect(r.createdActionIntent).toBe(false);
    const out = r.output!;
    expect(out.unsafeContentFlagged).toBe(true);
    expect(out.strippedFields).toContain("amount");
    expect(out.strippedFields).toContain("calldata");
    expect(out.strippedFields).toContain("contractAddress");
    expect(out.strippedFields).toContain("missionAmount");
    const text = JSON.stringify(out.insights);
    expect(text).not.toMatch(/0xdeadbeef/i);
    expect(text).not.toMatch(/ignore all previous instructions/i);
    expect(r.provenance!.authority).toBe("EXTERNAL_UNTRUSTED");
  });

  it("sends no internal identity — only a per-skill pseudonym", async () => {
    const r = await callCapability({
      skillId: "bot.mock.research",
      capabilityKind: "PROTOCOL_READ",
      inputs: { topic: "staking", email: "me@example.com" },
      actor,
      requestId: "r5",
    });
    expect(r.ok).toBe(true);
    expect(JSON.stringify(r.output)).not.toContain("me@example.com");
  });

  it("degrades honestly on timeout and keeps the breaker bounded", async () => {
    const r = await callCapability({
      skillId: "bot.mock.research",
      capabilityKind: "GENERAL_ANALYSIS",
      inputs: { question: "x" },
      actor,
      requestId: "r6",
      mockControls: { timeout: true },
    });
    expect(r.ok).toBe(false);
    expect(r.resultClass).toBe("TIMEOUT");
    expect(r.degradedNotice).toBeTruthy();
    expect(recentFederationTelemetry().at(-1)?.timedOut).toBe(true);
  }, 20_000);

  it("rejects malformed and oversized payloads", async () => {
    const malformed = await callCapability({
      skillId: "bot.mock.research",
      capabilityKind: "GENERAL_ANALYSIS",
      inputs: { question: "x" },
      actor,
      requestId: "r7",
      mockControls: { malformed: true },
    });
    expect(malformed.resultClass).toBe("SCHEMA_REJECTED");

    const oversized = await callCapability({
      skillId: "bot.mock.research",
      capabilityKind: "GENERAL_ANALYSIS",
      inputs: { question: "x" },
      actor,
      requestId: "r8",
      mockControls: { oversized: true },
    });
    expect(oversized.resultClass).toBe("SIZE_REJECTED");
  });

  it("rate limits per actor", async () => {
    let last = await callCapability({
      skillId: "bot.mock.research",
      capabilityKind: "PROTOCOL_READ",
      inputs: { topic: "t" },
      actor,
      requestId: "rl",
    });
    for (let i = 0; i < 15 && last.resultClass !== "RATE_LIMITED"; i += 1) {
      last = await callCapability({
        skillId: "bot.mock.research",
        capabilityKind: "PROTOCOL_READ",
        inputs: { topic: "t" },
        actor,
        requestId: `rl${i}`,
      });
    }
    expect(last.resultClass).toBe("RATE_LIMITED");
  });

  it("missing required input fails closed", async () => {
    const r = await callCapability({
      skillId: "bot.mock.research",
      capabilityKind: "PROTOCOL_READ",
      inputs: {},
      actor,
      requestId: "r9",
    });
    expect(r.resultClass).toBe("SCHEMA_REJECTED");
  });
});

describe("sanitizer", () => {
  it("drops non-http reference urls and bounds sizes", () => {
    const r = sanitizeCapabilityOutput({
      raw: {
        insights: [
          { label: "a".repeat(500), detail: "b".repeat(2000), url: "javascript:alert(1)" },
          ...Array.from({ length: 20 }, () => ({ label: "x", detail: "y" })),
        ],
      },
      maxBytes: 64_000,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.output.insights.length).toBeLessThanOrEqual(5);
    expect(r.output.insights[0].referenceUrl).toBeNull();
    expect(r.output.insights[0].label.length).toBeLessThanOrEqual(120);
    expect(r.output.insights[0].detail.length).toBeLessThanOrEqual(400);
  });
});

describe("candidate bridge", () => {
  const provenance = {
    provider: "p",
    skillId: "s",
    skillVersion: "1",
    requestId: "r",
    observedAt: new Date().toISOString(),
    freshness: "DAILY" as const,
    authority: "EXTERNAL_UNTRUSTED" as const,
    cached: false,
    cacheExpiresAt: null,
  };

  it("never lets a skill set mission economics and always requires user build", () => {
    const c = toCandidateInsight({
      output: {
        insights: [{ label: "l", detail: "d", referenceUrl: null }],
        suggestedOpportunityKind: "STAKING:START_STAKING",
        strippedFields: ["amount"],
        unsafeContentFlagged: true,
      },
      provenance,
    });
    expect(c.mappedOpportunityKind).toBe("STAKING:START_STAKING");
    expect(c.requiresCanonicalReResolution).toBe(true);
    expect(c.requiresExplicitUserBuild).toBe(true);
    expect(JSON.stringify(c)).not.toMatch(/"amountValue"/);
  });

  it("keeps unsupported suggestions explanation-only", () => {
    const c = toCandidateInsight({
      output: {
        insights: [],
        suggestedOpportunityKind: "TRADE:MEGA_YIELD",
        strippedFields: [],
        unsafeContentFlagged: false,
      },
      provenance,
    });
    expect(c.mappedOpportunityKind).toBeNull();
    expect(c.explanationOnly).toBe(true);
  });

  it("canonical value wins on contradiction", () => {
    const r = reconcileWithCanonical({ field: "fee", providerValue: 0, canonicalValue: 12 });
    expect(r.value).toBe(12);
    expect(r.contradiction).toBe(true);
    expect(r.note).toMatch(/authoritative/);
  });
});
