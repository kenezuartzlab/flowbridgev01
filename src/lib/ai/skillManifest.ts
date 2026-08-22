/**
 * V15 §8 — Flow AI Skill Manifest + sandbox validation harness.
 *
 * FlowBridge-defined schema (deliberately distinct from any future official BOT
 * standard). External project skills are READ-ONLY and sandboxed: they cannot
 * request write authority, secrets, private FlowBridge data, or inject system
 * instructions. Text they return is untrusted data.
 */
import { z } from "zod";

export const skillManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/, "id must be lowercase slug"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "version must be semver"),
  provider: z.object({
    project: z.string().min(2).max(80),
    contact: z.string().max(200).optional(),
    officialUrl: z.string().url().optional(),
  }),
  description: z.string().min(10).max(400),
  inputSchema: z.record(z.string(), z.unknown()),
  outputSchema: z.record(z.string(), z.unknown()),
  authority: z.object({
    read: z.literal(true),
    /** V15: external skills may never write. */
    write: z.literal(false),
  }),
  chains: z.array(z.number().int().positive()).max(8).default([]),
  contracts: z.array(z.string().regex(/^0x[a-fA-F0-9]{40}$/)).max(16).default([]),
  endpoints: z
    .array(
      z.object({
        kind: z.enum(["REST", "OPENAPI", "JSON_RPC", "CONTRACT_READ", "AGENT_PROTOCOL"]),
        url: z.string().url().optional(),
        method: z.string().max(64).optional(),
      }),
    )
    .max(8)
    .default([]),
  authType: z.enum(["NONE", "API_KEY", "OAUTH", "SIGNED_REQUEST"]),
  rateLimitPerMinute: z.number().int().min(1).max(600),
  privacyScope: z.enum(["PUBLIC_ONLY", "USER_CONSENTED"]),
  freshnessClass: z.enum(["REALTIME", "DAILY", "SLOW", "STATIC"]),
  evidenceFields: z.array(z.string().min(1)).min(1).max(16),
  healthCheck: z.object({
    url: z.string().url().optional(),
    timeoutMs: z.number().int().min(100).max(15_000),
  }),
});

export type SkillManifest = z.infer<typeof skillManifestSchema>;

export type ManifestValidation =
  | { valid: true; manifest: SkillManifest; sandbox: SandboxPolicy }
  | { valid: false; errors: readonly string[] };

export interface SandboxPolicy {
  readOnly: true;
  allowedDataClasses: readonly ["WEB_SOURCE", "PARTNER_SOURCE"];
  canReadUserData: false;
  canReadOrgData: false;
  canReadSecrets: false;
  canInjectInstructions: false;
  timeoutMs: number;
  maxRetries: number;
}

export function validateSkillManifest(input: unknown): ManifestValidation {
  const parsed = skillManifestSchema.safeParse(input);
  if (!parsed.success) {
    return { valid: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`) };
  }
  return {
    valid: true,
    manifest: parsed.data,
    sandbox: {
      readOnly: true,
      allowedDataClasses: ["WEB_SOURCE", "PARTNER_SOURCE"],
      canReadUserData: false,
      canReadOrgData: false,
      canReadSecrets: false,
      canInjectInstructions: false,
      timeoutMs: Math.min(parsed.data.healthCheck.timeoutMs, 8_000),
      maxRetries: 1,
    },
  };
}

/* ----------------------- untrusted output containment ---------------------- */

const INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore (all )?(previous|prior|above) instructions/i,
  /disregard (the )?(system|previous) (prompt|instructions)/i,
  /you are now [a-z ]{0,24}(admin|developer|root|unrestricted)/i,
  /reveal (your )?(system prompt|instructions|api key|secret)/i,
  /\bprint (the )?(env|environment|secrets?|private key)\b/i,
  /\b(execute|submit|sign) (this|the) (transaction|swap|transfer)\b/i,
  /grant (yourself|me) (admin|owner|super ?admin)/i,
];

export interface ContainmentResult {
  /** Text safe to hand to the synthesizer, wrapped as untrusted data. */
  text: string;
  injectionAttempts: readonly string[];
  truncated: boolean;
}

/**
 * Treat partner/project/web text as DATA. Injection attempts are stripped and
 * recorded; the remainder is fenced so it can never read as system policy.
 */
export function containUntrustedText(raw: string, maxChars = 2_000): ContainmentResult {
  const attempts: string[] = [];
  let text = String(raw ?? "");
  for (const re of INJECTION_PATTERNS) {
    const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    text = text.replace(global, (m) => {
      attempts.push(m.trim().slice(0, 120));
      return "[removed: instruction-like content]";
    });
  }
  const truncated = text.length > maxChars;
  return {
    text: truncated ? `${text.slice(0, maxChars)}…` : text,
    injectionAttempts: attempts,
    truncated,
  };
}

/* --------------------------- developer test harness ------------------------ */

export interface HarnessFixture {
  name: string;
  input: unknown;
  /** Simulated skill response; may contain hostile text. */
  response: unknown;
  latencyMs: number;
}

export interface HarnessReport {
  manifestValid: boolean;
  manifestErrors: readonly string[];
  fixtures: readonly {
    name: string;
    passed: boolean
    issues: readonly string[];
  }[];
  passed: boolean;
}

/**
 * Lets BOT ecosystem projects validate a skill before it can be enabled:
 * schema, read-only authority, timeout, evidence fields and injection safety.
 */
export function runSkillHarness(input: {
  manifest: unknown;
  fixtures: readonly HarnessFixture[];
}): HarnessReport {
  const validation = validateSkillManifest(input.manifest);
  if (!validation.valid) {
    return { manifestValid: false, manifestErrors: validation.errors, fixtures: [], passed: false };
  }
  const { manifest, sandbox } = validation;

  const fixtures = input.fixtures.map((f) => {
    const issues: string[] = [];
    if (f.latencyMs > sandbox.timeoutMs) issues.push(`exceeds sandbox timeout (${sandbox.timeoutMs}ms)`);
    const response = f.response as Record<string, unknown> | null;
    if (!response || typeof response !== "object") {
      issues.push("response must be a JSON object");
    } else {
      for (const field of manifest.evidenceFields) {
        if (!(field in response)) issues.push(`missing required evidence field "${field}"`);
      }
      const serialized = JSON.stringify(response);
      const contained = containUntrustedText(serialized);
      if (contained.injectionAttempts.length > 0) {
        issues.push(`prompt-injection content detected (${contained.injectionAttempts.length})`);
      }
      if ("systemPrompt" in response || "tools" in response) {
        issues.push("response may not supply system instructions or tool definitions");
      }
    }
    return { name: f.name, passed: issues.length === 0, issues };
  });

  return {
    manifestValid: true,
    manifestErrors: [],
    fixtures,
    passed: fixtures.every((f) => f.passed),
  };
}
