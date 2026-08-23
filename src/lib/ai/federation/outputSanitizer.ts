/**
 * FlowBridge V19 §5 — treat every byte of provider output as untrusted DATA.
 *
 * The sanitizer is pure and deterministic:
 *  - validates against an explicit bounded schema,
 *  - strips every economic / executable field (amount, target, calldata, chain),
 *  - neutralizes instruction-injection and claims of authority,
 *  - bounds all string and list sizes.
 *
 * Sanitized output can never be interpolated into SQL, calldata, contract
 * targets, system prompts or privileged commands, because no field it produces
 * carries an address, amount or instruction.
 */
import { z } from "zod";
import type { ExternalInsight, SanitizedCapabilityOutput } from "./capabilityTypes";

export const MAX_INSIGHTS = 5;
export const MAX_LABEL_CHARS = 120;
export const MAX_DETAIL_CHARS = 400;

/**
 * Fields a provider is never allowed to establish. Presence is recorded and the
 * value is discarded (V19 §6: canonical economics always win).
 */
export const FORBIDDEN_OUTPUT_FIELDS = [
  "amount",
  "amountWei",
  "value",
  "fee",
  "feeBps",
  "balance",
  "claimable",
  "allowance",
  "to",
  "target",
  "contract",
  "contractAddress",
  "address",
  "spender",
  "calldata",
  "data",
  "chainId",
  "chain",
  "gas",
  "gasPrice",
  "nonce",
  "signature",
  "privateKey",
  "seed",
  "mnemonic",
  "token",
  "vault",
  "actionIntent",
  "intent",
  "execute",
  "submit",
  "tx",
  "transaction",
  "missionAmount",
  "systemPrompt",
  "tools",
] as const;

/**
 * §6 — providers also rename economic fields (recommendedAmount, targetContract,
 * suggestedFee...). Any key that *looks* economic/executable is discarded and
 * reported, so renaming cannot smuggle a value past the allowlist.
 */
export const FORBIDDEN_FIELD_PATTERN =
  /(amount|value|balance|claimable|allowance|contract|target|address|spender|calldata|payload|chain|gas|nonce|signature|fee|token|vault|tx|transaction|intent|execute)/i;

const INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore\s+(?:all\s+|any\s+|previous\s+|prior\s+|the\s+)*(instructions|rules|policies)/gi,
  /disregard\s+(?:the\s+)?(above|previous|system)/gi,
  /you are (now )?(an? )?(admin|owner|operator|root|system)/gi,
  /(system|developer) prompt/gi,
  /send (the )?funds/gi,
  /transfer (all )?(funds|tokens|balance)/gi,
  /approve (unlimited|max)/gi,
  /(sign|submit|broadcast) (this|the) (tx|transaction|message)/gi,
  /seed phrase|private key|mnemonic/gi,
  /execute (this|the following)/gi,
  /\bon behalf of the user\b/gi,
  /i (am|have) (full )?(authority|authorized)/gi,
  /<\/?(script|iframe|system)\b/gi,
];

/** Loose inbound schema: unknown keys are detected, not silently accepted. */
const insightSchema = z
  .object({
    label: z.string().max(4_000).optional(),
    title: z.string().max(4_000).optional(),
    detail: z.string().max(8_000).optional(),
    text: z.string().max(8_000).optional(),
    referenceUrl: z.string().max(2_000).optional(),
    url: z.string().max(2_000).optional(),
  })
  .passthrough();

const outputSchema = z
  .object({
    insights: z.array(insightSchema).max(50).optional(),
    suggestedOpportunityKind: z.string().max(120).nullish(),
  })
  .passthrough();

export type SanitizeResult =
  | { ok: true; output: SanitizedCapabilityOutput }
  | { ok: false; reason: "SCHEMA_REJECTED" | "SIZE_REJECTED"; message: string };

function neutralize(raw: string): { text: string; flagged: boolean } {
  let flagged = false;
  let text = raw.replace(/[\u0000-\u001f\u007f]/g, " ");
  for (const re of INJECTION_PATTERNS) {
    re.lastIndex = 0;
    if (re.test(text)) {
      flagged = true;
      re.lastIndex = 0;
      text = text.replace(re, "[removed: unsafe instruction]");
    }
  }

  // Strip anything that looks like an executable target or calldata blob.
  if (/0x[a-fA-F0-9]{8,}/.test(text)) {
    flagged = true;
    text = text.replace(/0x[a-fA-F0-9]{8,}/g, "[removed: unverified address/calldata]");
  }
  return { text: text.replace(/\s+/g, " ").trim(), flagged };
}

function clamp(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function safeUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString().slice(0, 400);
  } catch {
    return null;
  }
}

/** Sanitizes one raw provider payload. `maxBytes` bounds the whole response. */
export function sanitizeCapabilityOutput(input: {
  raw: unknown;
  maxBytes: number;
}): SanitizeResult {
  let serialized: string;
  try {
    serialized = JSON.stringify(input.raw ?? null);
  } catch {
    return { ok: false, reason: "SCHEMA_REJECTED", message: "Provider payload is not serializable" };
  }
  if (serialized.length > input.maxBytes) {
    return {
      ok: false,
      reason: "SIZE_REJECTED",
      message: `Provider payload exceeded ${input.maxBytes} bytes`,
    };
  }

  const parsed = outputSchema.safeParse(input.raw);
  if (!parsed.success) {
    return { ok: false, reason: "SCHEMA_REJECTED", message: "Provider payload failed schema" };
  }

  const stripped = new Set<string>();
  let unsafe = false;

  const collectForbidden = (obj: unknown, depth = 0) => {
    if (depth > 4 || obj === null || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      for (const v of obj.slice(0, 50)) collectForbidden(v, depth + 1);
      return;
    }
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (
        (FORBIDDEN_OUTPUT_FIELDS as readonly string[]).includes(k) ||
        (k !== "insights" && k !== "suggestedOpportunityKind" && FORBIDDEN_FIELD_PATTERN.test(k))
      ) {
        stripped.add(k);
      }
      collectForbidden(v, depth + 1);
    }
  };
  collectForbidden(input.raw);

  const rawInsights = parsed.data.insights ?? [];
  const insights: ExternalInsight[] = [];
  for (const item of rawInsights.slice(0, MAX_INSIGHTS)) {
    const labelSrc = item.label ?? item.title ?? "";
    const detailSrc = item.detail ?? item.text ?? "";
    const label = neutralize(String(labelSrc));
    const detail = neutralize(String(detailSrc));
    if (label.flagged || detail.flagged) unsafe = true;
    if (!label.text && !detail.text) continue;
    insights.push({
      label: clamp(label.text || "External note", MAX_LABEL_CHARS),
      detail: clamp(detail.text, MAX_DETAIL_CHARS),
      referenceUrl: safeUrl(item.referenceUrl ?? item.url),
    });
  }

  const kindRaw = parsed.data.suggestedOpportunityKind;
  const suggestedOpportunityKind =
    typeof kindRaw === "string" && /^[A-Z_]{2,32}:[A-Z_]{2,48}$/.test(kindRaw.trim())
      ? kindRaw.trim()
      : null;
  if (typeof kindRaw === "string" && !suggestedOpportunityKind) stripped.add("suggestedOpportunityKind");

  return {
    ok: true,
    output: {
      insights,
      suggestedOpportunityKind,
      strippedFields: [...stripped].sort(),
      unsafeContentFlagged: unsafe || stripped.size > 0,
    },
  };
}
