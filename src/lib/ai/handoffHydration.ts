/**
 * V15.3F §1 — ActionIntent → Trade hydration.
 *
 * Root cause of the observed defect: the handoff link carried validated
 * correlation metadata AND economic hints (`from`, `to`, `amount`), but no
 * surface ever translated those hints into form state, so Trade opened empty and
 * the user was asked to retype the amount and pair.
 *
 * This module is the pure translation layer: hint → hydration plan. It resolves
 * a token reference (canonical address, native sentinel or symbol) against the
 * registry the surface is actually about to use, and normalizes the amount. It
 * never decides freshness (that stays in `evaluateHandoff`), never touches the
 * network, and never grants execution authority: after hydration the surface
 * re-resolves registry, balance, allowance, live fee/nonce, quote and simulation
 * itself, and only the user's wallet can sign.
 */
import type { HandoffHint } from "./intentHandoff";

export interface HydrationTokenLike {
  address: string;
  symbol: string;
  isNative?: boolean;
}

const NATIVE_SENTINEL = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

/** Matches a link hint to a registry token. Address wins over symbol. */
export function resolveHydrationToken<T extends HydrationTokenLike>(
  ref: string | null | undefined,
  tokens: readonly T[],
): T | null {
  if (!ref) return null;
  const r = ref.trim().toLowerCase();
  if (!r) return null;
  if (r === NATIVE_SENTINEL || r === "native") {
    return tokens.find((t) => t.isNative) ?? null;
  }
  const byAddress = tokens.find((t) => t.address.toLowerCase() === r);
  if (byAddress) return byAddress;
  return tokens.find((t) => t.symbol.toLowerCase() === r) ?? null;
}

/** Accepts only a plain positive decimal amount; anything else is discarded. */
export function normalizeHydrationAmount(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!/^\d{1,30}(\.\d{1,18})?$/.test(v)) return null;
  if (Number(v) <= 0) return null;
  return v;
}

export type HandoffSurfaceTab = "swap" | "bridge";

export function hydrationTabFor(hint: HandoffHint): HandoffSurfaceTab | null {
  const tab = (hint.hints.tab ?? "").toLowerCase();
  if (tab === "swap") return "swap";
  if (tab === "bridge") return "bridge";
  if (hint.type === "SWAP") return "swap";
  if (hint.type === "BRIDGE") return "bridge";
  return null;
}

export interface SwapHydrationPlan {
  /** Stable per-intent key: applied at most once, so a later user edit stands. */
  key: string;
  intentId: string;
  tokenInSymbol: string;
  tokenOutSymbol: string;
  amount: string;
}

export type SwapHydrationResult =
  | { ok: true; plan: SwapHydrationPlan }
  | { ok: false; reason: "NOT_SWAP" | "TOKEN_UNRESOLVED" | "AMOUNT_INVALID" };

/**
 * Builds the swap hydration plan. Every field must resolve against the live
 * registry: a partially resolvable hint is refused outright rather than
 * producing a half-filled form.
 */
export function buildSwapHydration<T extends HydrationTokenLike>(input: {
  hint: HandoffHint;
  tokens: readonly T[];
}): SwapHydrationResult {
  const { hint, tokens } = input;
  if (hydrationTabFor(hint) !== "swap") return { ok: false, reason: "NOT_SWAP" };
  const tokenIn = resolveHydrationToken(hint.hints.from ?? hint.hints.token, tokens);
  const tokenOut = resolveHydrationToken(hint.hints.to, tokens);
  if (!tokenIn || !tokenOut || tokenIn.symbol === tokenOut.symbol) {
    return { ok: false, reason: "TOKEN_UNRESOLVED" };
  }
  const amount = normalizeHydrationAmount(hint.hints.amount);
  if (!amount) return { ok: false, reason: "AMOUNT_INVALID" };
  return {
    ok: true,
    plan: {
      key: `${hint.intentId}:${hint.digest}`,
      intentId: hint.intentId,
      tokenInSymbol: tokenIn.symbol,
      tokenOutSymbol: tokenOut.symbol,
      amount,
    },
  };
}

/** Copy for the invalid-handoff state — never an empty form with no explanation. */
export const HYDRATION_FAILURE_COPY: Record<
  Exclude<SwapHydrationResult & { ok: false }, never>["reason"],
  string
> = {
  NOT_SWAP: "This handoff is not a swap plan, so the swap form was left untouched.",
  TOKEN_UNRESOLVED:
    "The prepared token pair is not in this network's registry, so Trade refused to prefill it. Ask Flow AI to prepare it again.",
  AMOUNT_INVALID:
    "The prepared amount did not survive the handoff, so Trade refused to guess it. Ask Flow AI to prepare it again.",
};
