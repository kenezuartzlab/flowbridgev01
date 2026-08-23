/**
 * FlowBridge V19 §4/§9/§11 — the single server-side capability adapter.
 *
 * Every external skill call goes through `callCapability`. It:
 *  - refuses unknown/disabled skills and undeclared capabilities (fail closed),
 *  - minimizes and validates inputs into one canonical envelope,
 *  - enforces per-skill timeout, bounded retries, per-actor rate limit, breaker,
 *  - sanitizes output as untrusted data,
 *  - attaches provider provenance + freshness, and records bounded telemetry.
 *
 * It cannot sign, submit, write economic records or create an ActionIntent —
 * there is no code path here that touches a wallet, RPC write or ledger table.
 */
import {
  type CapabilityCallResult,
  type CapabilityRequestEnvelope,
  type CapabilityResultClass,
  type FederationActorScope,
  isCapabilityKind,
} from "./capabilityTypes";
import {
  FEDERATION_ADAPTER_VERSION,
  findCapability,
  findSkill,
  isFederationGloballyEnabled,
  type CapabilityDescriptor,
  type FederatedSkillEntry,
} from "./skillFederationRegistry";
import { sanitizeCapabilityOutput } from "./outputSanitizer";
import { callMockBotSkill, type MockScenarioControls } from "./mockBotSkill.server";

interface RateWindow {
  windowStart: number;
  count: number;
}
interface BreakerState {
  failures: number;
  openedAt: number | null;
}
interface CacheEntry {
  at: number;
  expiresAt: number;
  payload: unknown;
}

const rateWindows = new Map<string, RateWindow>();
const breakers = new Map<string, BreakerState>();
const cache = new Map<string, CacheEntry>();

export interface FederationTelemetryRecord {
  requestId: string;
  at: string;
  skillId: string;
  skillVersion: string;
  capabilityKind: string;
  latencyMs: number;
  resultClass: CapabilityResultClass;
  schemaRejected: boolean;
  timedOut: boolean;
  unsafeContentFlagged: boolean;
  strippedFieldCount: number;
  canonicalContradiction: boolean;
}

const telemetry: FederationTelemetryRecord[] = [];

export function recentFederationTelemetry(limit = 25): readonly FederationTelemetryRecord[] {
  return telemetry.slice(-limit);
}

/** Per-skill pseudonym so no provider can correlate an actor across skills. */
export async function pseudonymousActorRef(
  userId: string | null,
  skillId: string,
): Promise<string | null> {
  if (!userId) return null;
  const data = new TextEncoder().encode(`${skillId}::${userId}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function validateInputs(
  capability: CapabilityDescriptor,
  raw: Record<string, unknown>,
): { ok: true; inputs: Record<string, string | number | boolean | null> } | { ok: false; message: string } {
  const inputs: Record<string, string | number | boolean | null> = {};
  for (const slot of capability.inputSlots) {
    const v = raw[slot.name];
    if (v === undefined || v === null || v === "") {
      if (slot.required) return { ok: false, message: `Missing required input '${slot.name}'` };
      continue;
    }
    if (slot.type === "string") {
      if (typeof v !== "string") return { ok: false, message: `Input '${slot.name}' must be a string` };
      inputs[slot.name] = v.slice(0, slot.maxLength ?? 200);
    } else if (slot.type === "number") {
      const n = Number(v);
      if (!Number.isFinite(n)) return { ok: false, message: `Input '${slot.name}' must be numeric` };
      inputs[slot.name] = n;
    } else {
      inputs[slot.name] = Boolean(v);
    }
  }
  // Undeclared inputs are dropped, never forwarded.
  return { ok: true, inputs };
}

function fail(
  resultClass: CapabilityResultClass,
  notice: string,
  latencyMs = 0,
): CapabilityCallResult {
  return {
    ok: false,
    resultClass,
    output: null,
    provenance: null,
    latencyMs,
    degradedNotice: notice,
    executed: false,
    createdActionIntent: false,
  };
}

function rateLimited(skill: FederatedSkillEntry, actorKey: string): boolean {
  const key = `${skill.skillId}::${actorKey}`;
  const now = Date.now();
  const w = rateWindows.get(key);
  if (!w || now - w.windowStart >= 60_000) {
    rateWindows.set(key, { windowStart: now, count: 1 });
    return false;
  }
  w.count += 1;
  return w.count > skill.ratePolicy.maxCallsPerMinute;
}

function breakerOpen(skill: FederatedSkillEntry): boolean {
  const b = breakers.get(skill.skillId);
  if (!b?.openedAt) return false;
  if (Date.now() - b.openedAt >= skill.circuitCooldownMs) {
    breakers.set(skill.skillId, { failures: 0, openedAt: null });
    return false;
  }
  return true;
}

function recordFailure(skill: FederatedSkillEntry) {
  const b = breakers.get(skill.skillId) ?? { failures: 0, openedAt: null };
  b.failures += 1;
  if (b.failures >= skill.circuitFailureThreshold) b.openedAt = Date.now();
  breakers.set(skill.skillId, b);
}

function recordSuccess(skill: FederatedSkillEntry) {
  breakers.set(skill.skillId, { failures: 0, openedAt: null });
}

export interface CallCapabilityInput {
  skillId: string;
  capabilityKind: string;
  inputs?: Record<string, unknown>;
  actor: { userId: string | null; walletAddress?: string | null };
  requestId: string;
  /** Test-only deterministic provider behaviour for the mock transport. */
  mockControls?: MockScenarioControls;
  env?: Record<string, string | undefined>;
}

export async function callCapability(input: CallCapabilityInput): Promise<CapabilityCallResult> {
  const started = Date.now();
  const push = (rec: Omit<FederationTelemetryRecord, "at">) => {
    telemetry.push({ ...rec, at: new Date().toISOString() });
    if (telemetry.length > 200) telemetry.splice(0, telemetry.length - 200);
  };

  if (!isFederationGloballyEnabled(input.env)) {
    return fail("DISABLED", "External BOT skills are turned off right now.");
  }
  const skill = findSkill(input.skillId);
  if (!skill) {
    return fail("UNKNOWN_SKILL", "That skill is not approved for FlowBridge.");
  }
  if (!skill.enabled) {
    return fail("DISABLED", `${skill.provider} is currently disabled.`);
  }
  if (!isCapabilityKind(input.capabilityKind)) {
    return fail("CAPABILITY_NOT_DECLARED", "That capability class does not exist.");
  }
  const capability = findCapability(skill, input.capabilityKind);
  if (!capability) {
    return fail("CAPABILITY_NOT_DECLARED", `${skill.provider} does not declare that capability.`);
  }

  const actorKey = input.actor.userId ?? "anonymous";
  if (rateLimited(skill, actorKey)) {
    return fail("RATE_LIMITED", "You've queried this skill too often — try again shortly.");
  }
  if (breakerOpen(skill)) {
    return fail("CIRCUIT_OPEN", `${skill.provider} is temporarily unavailable; using FlowBridge data only.`);
  }

  const validated = validateInputs(capability, input.inputs ?? {});
  if (!validated.ok) {
    return fail("SCHEMA_REJECTED", validated.message);
  }

  const actorScope: FederationActorScope = {
    pseudonymousActorRef: await pseudonymousActorRef(input.actor.userId, skill.skillId),
    scope: input.actor.userId ? "AUTHENTICATED" : "PUBLIC",
    walletAddress: capability.requiresWalletAddress ? (input.actor.walletAddress ?? null) : null,
  };

  const envelope: CapabilityRequestEnvelope = {
    requestId: input.requestId,
    skillId: skill.skillId,
    skillVersion: skill.version,
    capabilityKind: input.capabilityKind,
    actor: actorScope,
    inputs: validated.inputs,
    deadline: new Date(Date.now() + skill.timeoutMs).toISOString(),
    provenance: { origin: "flowbridge-server", adapterVersion: FEDERATION_ADAPTER_VERSION },
  };

  const cacheKey = `${skill.skillId}::${skill.version}::${input.capabilityKind}::${JSON.stringify(validated.inputs)}`;
  let raw: unknown;
  let cached = false;
  let cacheExpiresAt: string | null = null;

  const hit = capability.cacheTtlMs > 0 ? cache.get(cacheKey) : undefined;
  if (hit && hit.expiresAt > Date.now()) {
    raw = hit.payload;
    cached = true;
    cacheExpiresAt = new Date(hit.expiresAt).toISOString();
  } else {
    let lastError: unknown = null;
    let timedOut = false;
    for (let attempt = 0; attempt <= skill.maxRetries; attempt += 1) {
      try {
        raw = await withTimeout(invokeProvider(skill, envelope, input.mockControls), skill.timeoutMs);
        lastError = null;
        timedOut = false;
        break;
      } catch (e: any) {
        lastError = e;
        timedOut = e?.name === "FederationTimeout";
      }
    }
    if (lastError) {
      recordFailure(skill);
      const latencyMs = Date.now() - started;
      push({
        requestId: input.requestId,
        skillId: skill.skillId,
        skillVersion: skill.version,
        capabilityKind: input.capabilityKind,
        latencyMs,
        resultClass: timedOut ? "TIMEOUT" : "PROVIDER_ERROR",
        schemaRejected: false,
        timedOut,
        unsafeContentFlagged: false,
        strippedFieldCount: 0,
        canonicalContradiction: false,
      });
      return fail(
        timedOut ? "TIMEOUT" : "PROVIDER_ERROR",
        `${skill.provider} did not respond in time — showing FlowBridge data only.`,
        latencyMs,
      );
    }
    if (capability.cacheTtlMs > 0) {
      const expiresAt = Date.now() + capability.cacheTtlMs;
      cache.set(cacheKey, { at: Date.now(), expiresAt, payload: raw });
      cacheExpiresAt = new Date(expiresAt).toISOString();
    }
  }

  const sanitized = sanitizeCapabilityOutput({ raw, maxBytes: skill.maxResponseBytes });
  const latencyMs = Date.now() - started;
  if (!sanitized.ok) {
    recordFailure(skill);
    push({
      requestId: input.requestId,
      skillId: skill.skillId,
      skillVersion: skill.version,
      capabilityKind: input.capabilityKind,
      latencyMs,
      resultClass: sanitized.reason,
      schemaRejected: true,
      timedOut: false,
      unsafeContentFlagged: true,
      strippedFieldCount: 0,
      canonicalContradiction: false,
    });
    return fail(sanitized.reason, "That skill returned an unusable response, so it was ignored.", latencyMs);
  }

  recordSuccess(skill);
  push({
    requestId: input.requestId,
    skillId: skill.skillId,
    skillVersion: skill.version,
    capabilityKind: input.capabilityKind,
    latencyMs,
    resultClass: sanitized.output.unsafeContentFlagged ? "SANITIZED" : "OK",
    schemaRejected: false,
    timedOut: false,
    unsafeContentFlagged: sanitized.output.unsafeContentFlagged,
    strippedFieldCount: sanitized.output.strippedFields.length,
    canonicalContradiction: false,
  });

  return {
    ok: true,
    resultClass: sanitized.output.unsafeContentFlagged ? "SANITIZED" : "OK",
    output: sanitized.output,
    provenance: {
      provider: skill.provider,
      skillId: skill.skillId,
      skillVersion: skill.version,
      requestId: input.requestId,
      observedAt: new Date().toISOString(),
      freshness: capability.freshness,
      authority: "EXTERNAL_UNTRUSTED",
      cached,
      cacheExpiresAt,
    },
    latencyMs,
    degradedNotice: null,
    executed: false,
    createdActionIntent: false,
  };
}

async function invokeProvider(
  skill: FederatedSkillEntry,
  envelope: CapabilityRequestEnvelope,
  mockControls?: MockScenarioControls,
): Promise<unknown> {
  if (skill.transport === "MOCK") return callMockBotSkill(envelope, mockControls);
  if (!skill.endpoint) throw new Error("skill endpoint not configured");
  const res = await fetch(skill.endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(envelope),
  });
  if (!res.ok) throw new Error(`provider status ${res.status}`);
  return res.json();
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      const err = new Error("federation timeout");
      err.name = "FederationTimeout";
      reject(err);
    }, ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Test/ops helper: clears in-memory rate, breaker and cache state. */
export function resetFederationRuntimeState(): void {
  rateWindows.clear();
  breakers.clear();
  cache.clear();
  telemetry.length = 0;
}
