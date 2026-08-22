/**
 * V15.3J §2/§4 — the canonical prepared-ActionIntent snapshot.
 *
 * Root cause this module closes: economic parameters travelled to Trade as
 * query-string text (`from`, `to`, `amount`). The SPA router re-serializes a
 * numeric-looking search string through JSON, so a prepared `amount=10` arrived
 * as `amount="10"`, failed amount validation and Trade reported MALFORMED even
 * though the preparation itself was correct.
 *
 * From V15.3J the link carries only an opaque intent id plus non-authoritative
 * integrity hints. Every economic field is resolved from THIS canonical snapshot,
 * which is built once, on the server, immediately after READY_FOR_USER, and is
 * immutable afterwards.
 *
 * Amounts are carried twice and never as floats:
 *   - `amountInDisplay` — the exact decimal string the user supplied ("10")
 *   - `amountInRaw`     — bigint-safe base-unit string ("10000000")
 *
 * Pure module: no network, no DB, no keys, no authority. A canonical snapshot is
 * still only a plan: Trade re-reads balance, allowance, live fee/nonce, quote and
 * simulation, and only the user's own wallet can sign.
 */
import { z } from "zod";
import {
  actionIntentSchema,
  economicFingerprint,
  type ActionIntent,
  type ActionIntentType,
} from "./actionIntent";
import { fingerprintDigest, handoffFingerprint } from "./intentHandoff";

export const CANONICAL_INTENT_SCHEMA_VERSION = "flowbridge.canonical-action-intent/1" as const;

const hex40 = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const decimalString = z.string().regex(/^\d{1,30}(\.\d{1,18})?$/);
const rawString = z.string().regex(/^\d{1,78}$/);

export const canonicalSwapLegSchema = z.object({
  tokenInAddress: hex40,
  tokenOutAddress: hex40,
  decimalsIn: z.number().int().min(0).max(36),
  decimalsOut: z.number().int().min(0).max(36),
  amountInDisplay: decimalString,
  amountInRaw: rawString,
  slippageBps: z.number().int().min(1).max(500),
  recipient: hex40,
});
export type CanonicalSwapLeg = z.infer<typeof canonicalSwapLegSchema>;

export const canonicalPreparedIntentSchema = z.object({
  schemaVersion: z.literal(CANONICAL_INTENT_SCHEMA_VERSION),
  intentId: z.string().min(8).max(64),
  type: z.string().min(3),
  chainId: z.number().int().positive(),
  targetContract: hex40.nullable(),
  actorUserId: z.string().min(1).nullable(),
  actorWallet: hex40.nullable(),
  createdAt: z.string().min(10),
  expiresAt: z.string().min(10),
  /** Digest of the economic fingerprint — the same value the link carries as `fp`. */
  digest: z.string().min(4).max(32),
  /** Present for SWAP only; other types keep their parameters verbatim. */
  swap: canonicalSwapLegSchema.nullable(),
  /** Verbatim server parameters, kept for revalidation. Never client-authored. */
  parameters: z.record(z.string(), z.unknown()),
});
export type CanonicalPreparedIntent = z.infer<typeof canonicalPreparedIntentSchema>;

/** bigint-safe decimal → base units. Never uses floats. */
export function toRawAmount(display: string, decimals: number): string {
  const v = display.trim();
  if (!/^\d{1,30}(\.\d{1,18})?$/.test(v)) throw new Error("amount is not a plain decimal string");
  const [whole, frac = ""] = v.split(".");
  if (frac.length > decimals) {
    const truncated = frac.slice(0, decimals);
    if (/[1-9]/.test(frac.slice(decimals))) {
      throw new Error("amount has more precision than the token supports");
    }
    return BigInt(`${whole}${truncated.padEnd(decimals, "0")}`).toString();
  }
  return BigInt(`${whole}${frac.padEnd(decimals, "0")}`).toString();
}

/** base units → exact decimal display, no float rounding. */
export function fromRawAmount(raw: string, decimals: number): string {
  const v = BigInt(raw).toString().padStart(decimals + 1, "0");
  const whole = v.slice(0, v.length - decimals);
  const frac = decimals > 0 ? v.slice(v.length - decimals).replace(/0+$/, "") : "";
  return frac ? `${whole}.${frac}` : whole;
}

/** The digest the deep link carries; derived from the intent, never from the URL. */
export function canonicalDigest(intent: ActionIntent): string {
  const p = intent.parameters as Record<string, any>;
  return fingerprintDigest(
    handoffFingerprint({
      type: intent.type,
      chainId: intent.chainId,
      targetContract: intent.targetContract,
      tokenIn: p.tokenIn ?? p.token ?? null,
      tokenOut: p.tokenOut ?? null,
      amount: p.amountIn ?? p.amountFlow ?? p.claimableFlow ?? null,
      destinationChainId: p.destinationChainId ?? null,
    }),
  );
}

export type CanonicalizationResult =
  | { ok: true; canonical: CanonicalPreparedIntent }
  | { ok: false; errors: string[] };

/**
 * §2 — the SINGLE canonical builder. Both preparation paths (all slots in one
 * message, or amount completed on a later turn) converge here, so there is no
 * second object shape and no parallel amount field to drift.
 */
export function normalizePreparedIntent(intent: ActionIntent): CanonicalizationResult {
  const errors: string[] = [];
  const p = intent.parameters as Record<string, any>;

  let swap: CanonicalSwapLeg | null = null;
  if (intent.type === "SWAP") {
    const decimalsIn = Number(p.decimalsIn);
    const display = typeof p.amountIn === "string" ? p.amountIn.trim() : "";
    if (!Number.isInteger(decimalsIn)) errors.push("decimalsIn unresolved");
    if (!display) errors.push("amountIn missing");
    if (!p.tokenIn || !p.tokenOut) errors.push("token identities unresolved");
    if (errors.length === 0) {
      let raw = "0";
      try {
        raw = toRawAmount(display, decimalsIn);
      } catch (e: any) {
        errors.push(`amountInRaw not derivable: ${e?.message ?? "invalid amount"}`);
      }
      if (errors.length === 0 && BigInt(raw) <= 0n) errors.push("amountInRaw must be > 0");
      // §4 — a normalization that changes the amount fails HERE, before the user
      // is ever shown a review card Trade could not consume.
      if (errors.length === 0 && fromRawAmount(raw, decimalsIn) !== normalizeDisplay(display)) {
        errors.push("amount changed during normalization");
      }
      if (errors.length === 0) {
        const parsed = canonicalSwapLegSchema.safeParse({
          tokenInAddress: String(p.tokenIn),
          tokenOutAddress: String(p.tokenOut),
          decimalsIn,
          decimalsOut: Number(p.decimalsOut),
          amountInDisplay: normalizeDisplay(display),
          amountInRaw: raw,
          slippageBps: Number(p.slippageBps),
          recipient: String(p.recipient),
        });
        if (!parsed.success) errors.push(...parsed.error.issues.map((i) => `swap.${i.path.join(".")}: ${i.message}`));
        else swap = parsed.data;
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const candidate = {
    schemaVersion: CANONICAL_INTENT_SCHEMA_VERSION,
    intentId: intent.id,
    type: intent.type,
    chainId: intent.chainId,
    targetContract: intent.targetContract,
    actorUserId: intent.actorUserId,
    actorWallet: intent.actorWallet,
    createdAt: intent.createdAt,
    expiresAt: intent.expiresAt,
    digest: canonicalDigest(intent),
    swap,
    parameters: intent.parameters as Record<string, unknown>,
  };
  const parsed = canonicalPreparedIntentSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  return { ok: true, canonical: parsed.data };
}

/** Trims redundant zeros so display comparison is exact, not textual. */
export function normalizeDisplay(display: string): string {
  const v = display.trim();
  if (!v.includes(".")) return String(BigInt(v));
  const [whole, frac] = v.split(".");
  const cleanFrac = frac.replace(/0+$/, "");
  const cleanWhole = String(BigInt(whole || "0"));
  return cleanFrac ? `${cleanWhole}.${cleanFrac}` : cleanWhole;
}

/**
 * §2 — READY_FOR_USER invariant. A prepared SWAP cannot be advertised to the user
 * unless the canonical snapshot exists with a positive raw amount, resolved
 * tokens, a chain and a derivable fingerprint.
 */
export function assertReadyInvariant(intent: ActionIntent): CanonicalizationResult {
  const parsedIntent = actionIntentSchema.safeParse(intent);
  if (!parsedIntent.success) {
    return { ok: false, errors: parsedIntent.error.issues.map((i) => i.message) };
  }
  if (!economicFingerprint(intent)) return { ok: false, errors: ["fingerprint not derivable"] };
  return normalizePreparedIntent(intent);
}

/** Safe-to-log audit line: ids, symbols, lengths — never secrets. */
export function canonicalAuditFields(c: CanonicalPreparedIntent): Record<string, string | number> {
  return {
    intentId: c.intentId,
    schemaVersion: c.schemaVersion,
    type: c.type,
    chainId: c.chainId,
    amountInDisplay: c.swap?.amountInDisplay ?? "",
    amountInRawLength: c.swap?.amountInRaw.length ?? 0,
    tokenIn: c.swap?.tokenInAddress ?? "",
    tokenOut: c.swap?.tokenOutAddress ?? "",
    digest: c.digest,
  };
}

export const CANONICAL_TYPES: readonly ActionIntentType[] = ["SWAP", "BRIDGE"] as const;
