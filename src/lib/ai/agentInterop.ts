/**
 * V15.2 §6/§7 — BOT ecosystem agent/skill interoperability.
 *
 * External skills are read-only, sandboxed and UNTRUSTED. They may answer
 * questions (routes, analytics, availability, project facts); they may never
 * invoke FlowBridge writes, request signatures, change an ActionIntent status,
 * escalate scope, or substitute a recipient/contract. Every result is schema-
 * checked, freshness-checked and address-checked before synthesis.
 */
import { z } from "zod";
import { skillManifestSchema, containUntrustedText } from "./skillManifest";
import { ACTION_INTENT_TYPES } from "./actionIntent";

const hex40 = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

/** §6 — optional manifest extension. Write authority is impossible by schema. */
export const agentInteropSchema = z.object({
  project: z.string().min(2).max(80),
  agentId: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  chains: z.array(z.number().int().positive()).max(8),
  readOnly: z.literal(true),
  intentTypes: z.array(z.enum(ACTION_INTENT_TYPES)).max(ACTION_INTENT_TYPES.length),
  requestSchema: z.record(z.string(), z.unknown()),
  resultSchema: z.record(z.string(), z.unknown()),
  evidenceSchema: z.record(z.string(), z.unknown()),
  authModel: z.enum(["NONE", "API_KEY", "SIGNED_REQUEST"]),
  timeoutMs: z.number().int().min(100).max(10_000),
  /** Only true when the project documents a verifiable envelope mechanism. */
  verifiableResults: z.boolean().default(false),
  availability: z.enum(["unavailable", "announced", "testnet", "mainnet", "degraded"]),
  health: z.object({ url: z.string().url().optional(), lastOkAt: z.string().nullable() }),
  /** Feature-flagged adapters (Agent Wallet, identity, launchpad) stay off. */
  featureFlag: z.string().max(64).nullable().default(null),
});
export type AgentInterop = z.infer<typeof agentInteropSchema>;

export const interopManifestSchema = skillManifestSchema.extend({
  agentInterop: agentInteropSchema.optional(),
});
export type InteropManifest = z.infer<typeof interopManifestSchema>;

/* --------------------------------- envelopes ------------------------------- */

export const agentTaskSchema = z.object({
  taskId: z.string().min(8).max(64),
  requester: z.literal("flowbridge.flow-ai"),
  targetSkill: z.string().min(3).max(64),
  purpose: z.string().min(4).max(200),
  /** Never user/org private data: external skills see public context only. */
  allowedDataScope: z.literal("PUBLIC_ONLY"),
  inputs: z.record(z.string(), z.unknown()),
  chainContext: z.object({ chainId: z.number().int().positive() }),
  expiry: z.string(),
  maxLatencyMs: z.number().int().min(100).max(10_000),
  evidenceRequired: z.array(z.string().min(1)).min(1).max(12),
});
export type AgentTask = z.infer<typeof agentTaskSchema>;

export const agentResultSchema = z
  .object({
    taskId: z.string().min(8).max(64),
    provider: z.string().min(2).max(80),
    result: z.record(z.string(), z.unknown()),
    evidence: z.record(z.string(), z.unknown()),
    generatedAt: z.string(),
    expiresAt: z.string(),
    availability: z.enum(["unavailable", "announced", "testnet", "mainnet", "degraded"]),
    confidenceState: z.enum(["VERIFIED", "CURRENT", "ESTIMATED", "STALE", "UNAVAILABLE"]),
    warnings: z.array(z.string().max(200)).max(12).default([]),
  })
  .strict();
export type AgentResult = z.infer<typeof agentResultSchema>;

export function createAgentTask(input: {
  taskId: string;
  targetSkill: string;
  purpose: string;
  inputs: Record<string, unknown>;
  chainId: number;
  evidenceRequired: readonly string[];
  maxLatencyMs?: number;
  now?: Date;
}): AgentTask {
  const now = input.now ?? new Date();
  return agentTaskSchema.parse({
    taskId: input.taskId,
    requester: "flowbridge.flow-ai",
    targetSkill: input.targetSkill,
    purpose: input.purpose,
    allowedDataScope: "PUBLIC_ONLY",
    inputs: input.inputs,
    chainContext: { chainId: input.chainId },
    expiry: new Date(now.getTime() + 30_000).toISOString(),
    maxLatencyMs: input.maxLatencyMs ?? 4_000,
    evidenceRequired: [...input.evidenceRequired],
  });
}

/* ------------------------------- verification ------------------------------ */

/** Content an external result may never contain. */
const ESCALATION_KEYS = [
  "systemprompt",
  "tools",
  "role",
  "isadmin",
  "admin",
  "superadmin",
  "treasury",
  "signer",
  "owner",
  "privatekey",
  "seedphrase",
  "mnemonic",
  "authorization",
  "apikey",
  "status", // an external skill may never set ActionIntent status
];

export interface AgentResultVerification {
  accepted: boolean;
  rejections: readonly string[];
  warnings: readonly string[];
  /** Contained, injection-stripped payload safe to hand to synthesis as DATA. */
  containedText: string | null;
}

/**
 * §7/§8 — reject mismatched task ids, expired or future-dated results, missing
 * evidence, unexpected fields, privilege escalation, and any attempt to swap the
 * recipient or contract for something other than what FlowBridge asked for.
 */
export function verifyAgentResult(input: {
  task: AgentTask;
  result: unknown;
  latencyMs: number;
  /** Deterministic expectations — registry truth, not model output. */
  expected?: { recipient?: string | null; contract?: string | null; chainId?: number };
  now?: Date;
}): AgentResultVerification {
  const now = input.now ?? new Date();
  const rejections: string[] = [];
  const warnings: string[] = [];

  const parsed = agentResultSchema.safeParse(input.result);
  if (!parsed.success) {
    return {
      accepted: false,
      rejections: parsed.error.issues.map(
        (i) => `${i.path.join(".") || "result"}: ${i.message}`,
      ),
      warnings,
      containedText: null,
    };
  }
  const res = parsed.data;

  if (res.taskId !== input.task.taskId) rejections.push("taskId mismatch");
  if (input.latencyMs > input.task.maxLatencyMs) rejections.push("provider exceeded maxLatency");
  if (new Date(input.task.expiry).getTime() <= now.getTime()) rejections.push("task expired");
  if (new Date(res.expiresAt).getTime() <= now.getTime()) rejections.push("result already expired");
  if (new Date(res.generatedAt).getTime() > now.getTime() + 60_000) {
    rejections.push("result generatedAt is in the future");
  }

  for (const field of input.task.evidenceRequired) {
    if (!(field in res.evidence)) rejections.push(`missing required evidence field "${field}"`);
  }

  const flat = JSON.stringify({ result: res.result, evidence: res.evidence });
  for (const key of Object.keys(res.result)) {
    if (ESCALATION_KEYS.includes(key.toLowerCase())) {
      rejections.push(`result contains privilege-escalation field "${key}"`);
    }
  }

  const expected = input.expected ?? {};
  const addressesIn = (obj: Record<string, unknown>, keys: readonly string[]) =>
    keys
      .map((k) => obj[k])
      .filter((v): v is string => typeof v === "string" && /^0x[a-fA-F0-9]{40}$/.test(v))
      .map((v) => v.toLowerCase());

  if (expected.recipient) {
    for (const a of addressesIn(res.result, ["recipient", "to", "receiver", "beneficiary"])) {
      if (a !== expected.recipient.toLowerCase()) {
        rejections.push("provider returned a different recipient than requested");
      }
    }
  }
  if (expected.contract) {
    for (const a of addressesIn(res.result, ["contract", "target", "router", "spender", "vault"])) {
      if (a !== expected.contract.toLowerCase()) {
        rejections.push("provider returned a different contract than the canonical one");
      }
    }
  }
  if (expected.chainId && typeof res.result.chainId === "number" && res.result.chainId !== expected.chainId) {
    rejections.push("provider returned a different chainId");
  }

  const contained = containUntrustedText(flat, 1_500);
  if (contained.injectionAttempts.length > 0) {
    rejections.push(`prompt-injection content detected (${contained.injectionAttempts.length})`);
  }

  if (res.availability === "announced" || res.availability === "unavailable") {
    warnings.push("provider reports the capability is not live");
  }
  if (res.confidenceState === "ESTIMATED" || res.confidenceState === "STALE") {
    warnings.push(`provider confidence is ${res.confidenceState}`);
  }
  if (!hasVerifiableEnvelope(res)) {
    warnings.push("unsigned provider result — treated as untrusted read-only data");
  }

  return {
    accepted: rejections.length === 0,
    rejections,
    warnings: [...warnings, ...res.warnings],
    containedText: rejections.length === 0 ? contained.text : null,
  };
}

function hasVerifiableEnvelope(res: AgentResult): boolean {
  const sig = (res.evidence as Record<string, unknown>).signature;
  return typeof sig === "string" && sig.length > 16;
}

/**
 * §7 — third-party claims never become global knowledge automatically. They
 * enter the existing candidate pipeline for later verification.
 */
export function toKnowledgeCandidate(input: {
  task: AgentTask;
  result: AgentResult;
  text: string;
}): {
  scope: "PUBLIC_BOT_ECOSYSTEM";
  authority: "PROJECT_SOURCE";
  promoted: false;
  provider: string;
  observedAt: string;
  text: string;
} {
  return {
    scope: "PUBLIC_BOT_ECOSYSTEM",
    authority: "PROJECT_SOURCE",
    promoted: false,
    provider: input.result.provider,
    observedAt: input.result.generatedAt,
    text: input.text.slice(0, 1_500),
  };
}

/** §6 — future BOT adapters stay disabled until official endpoints exist. */
export const AGENT_INTEROP_FEATURE_FLAGS = {
  bot_agent_wallet_4337: false,
  bot_agent_identity_8004: false,
  bot_agent_launchpad: false,
  bot_vcompute: false,
} as const;

export function interopEnabled(flag: keyof typeof AGENT_INTEROP_FEATURE_FLAGS): boolean {
  return AGENT_INTEROP_FEATURE_FLAGS[flag];
}

export function validateInteropManifest(input: unknown):
  | { valid: true; manifest: InteropManifest }
  | { valid: false; errors: readonly string[] } {
  const parsed = interopManifestSchema.safeParse(input);
  if (!parsed.success) {
    return { valid: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`) };
  }
  const flag = parsed.data.agentInterop?.featureFlag;
  if (flag && !(flag in AGENT_INTEROP_FEATURE_FLAGS)) {
    return { valid: false, errors: [`agentInterop.featureFlag "${flag}" is not a known FlowBridge flag`] };
  }
  if (flag && !interopEnabled(flag as keyof typeof AGENT_INTEROP_FEATURE_FLAGS)) {
    return { valid: false, errors: [`agentInterop.featureFlag "${flag}" is disabled until official endpoints exist`] };
  }
  return { valid: true, manifest: parsed.data };
}

export const AGENT_RESULT_ADDRESS_FIELDS = ["recipient", "to", "receiver", "beneficiary"] as const;
export const _hex40 = hex40;
