/**
 * FlowBridge V24 §2/§9 — structured, redacted intelligence telemetry.
 *
 * What is recorded: request id, actor-scope pseudonym, component/model versions,
 * canonical snapshot ids, evidence ids, typed status/degradation, selected
 * skills/templates, latency by stage and the economic-write counters.
 *
 * What is NEVER recorded: secrets, tokens, signatures, raw private memory,
 * unrestricted provider payloads, model chain-of-thought or account content.
 * `sanitizeTelemetry` enforces that even if a caller passes something unsafe.
 */
import { componentVersions } from "./foundationVersions";
import type { IntelligenceStatus } from "./intelligenceStatus";
import type { IntelligenceSurface, LatencyStage } from "./budgets";
import { killSwitchSnapshot, type EnvLike } from "./killSwitches";

/** Keys whose values are dropped outright, whatever their content. */
const FORBIDDEN_KEY_PATTERN =
  /(secret|token|apikey|api_key|password|signature|privatekey|private_key|mnemonic|seed|cookie|authorization|bearer|chainofthought|chain_of_thought|reasoningtrace|rawpayload|raw_payload|memoryvalue|memory_value|email)/i;

/** A non-reversible, non-PII actor pseudonym stable within a deployment. */
export function actorPseudonym(userId: string | null | undefined): string {
  if (!userId) return "anon";
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < userId.length; i++) {
    const c = userId.charCodeAt(i);
    h1 = ((h1 ^ c) * 0x01000193) >>> 0;
    h2 = ((h2 + c * (i + 7)) * 0x85ebca6b) >>> 0;
  }
  return `actor_${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

export interface IntelligenceTelemetry {
  suiteVersion: string;
  surface: IntelligenceSurface;
  requestId: string;
  actorPseudonym: string;
  actorScopes: readonly string[];
  status: IntelligenceStatus;
  degradedReasons: readonly string[];
  canonicalSnapshotIds: readonly string[];
  evidenceIds: readonly string[];
  selectedSkillIds: readonly string[];
  selectedTemplateIds: readonly string[];
  latencyMs: Record<string, number>;
  killSwitches: Record<string, boolean>;
  versions: Record<string, string>;
  /** §14 — economic inertness counters, recorded on every read-only surface. */
  missionWrites: number;
  actionIntentWrites: number;
  signatures: number;
  blockchainTransactions: number;
  generatedAt: string;
}

export interface TelemetryInput {
  surface: IntelligenceSurface;
  requestId: string;
  userId?: string | null;
  actorScopes?: readonly string[];
  status: IntelligenceStatus;
  degradedReasons?: readonly string[];
  canonicalSnapshotIds?: readonly (string | null | undefined)[];
  evidenceIds?: readonly (string | null | undefined)[];
  selectedSkillIds?: readonly string[];
  selectedTemplateIds?: readonly string[];
  latencyMs?: Partial<Record<LatencyStage, number>> & Record<string, number>;
  missionWrites?: number;
  actionIntentWrites?: number;
  signatures?: number;
  blockchainTransactions?: number;
  env?: EnvLike;
  now?: Date;
}

export function buildTelemetry(input: TelemetryInput): IntelligenceTelemetry {
  const versions = componentVersions();
  return {
    suiteVersion: versions.evalSuite,
    surface: input.surface,
    requestId: input.requestId,
    actorPseudonym: actorPseudonym(input.userId ?? null),
    actorScopes: input.actorScopes ?? [],
    status: input.status,
    degradedReasons: input.degradedReasons ?? [],
    canonicalSnapshotIds: (input.canonicalSnapshotIds ?? []).filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    ),
    evidenceIds: (input.evidenceIds ?? []).filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    ),
    selectedSkillIds: input.selectedSkillIds ?? [],
    selectedTemplateIds: input.selectedTemplateIds ?? [],
    latencyMs: { ...(input.latencyMs ?? {}) },
    killSwitches: killSwitchSnapshot(input.env),
    versions: { ...versions },
    missionWrites: input.missionWrites ?? 0,
    actionIntentWrites: input.actionIntentWrites ?? 0,
    signatures: input.signatures ?? 0,
    blockchainTransactions: input.blockchainTransactions ?? 0,
    generatedAt: (input.now ?? new Date()).toISOString(),
  };
}

/** Final guard before anything is logged. Drops unsafe keys and long blobs. */
export function sanitizeTelemetry(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (FORBIDDEN_KEY_PATTERN.test(key)) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === "string") {
      if (value.length > 512) continue;
      if (/^(0x[0-9a-f]{130,}|ey[a-z0-9_-]{20,}\.)/i.test(value)) continue;
      out[key] = value;
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value
        .slice(0, 25)
        .filter((v) => typeof v === "string" || typeof v === "number" || typeof v === "boolean");
      continue;
    }
    if (typeof value === "object") {
      out[key] = sanitizeTelemetry(value as Record<string, unknown>);
    }
  }
  return out;
}

/** One structured line per intelligence request. Safe by construction. */
export function logIntelligenceTelemetry(record: IntelligenceTelemetry): void {
  const safe = sanitizeTelemetry(record as unknown as Record<string, unknown>);
  console.info(`[flow-ai.telemetry] ${JSON.stringify(safe)}`);
}
