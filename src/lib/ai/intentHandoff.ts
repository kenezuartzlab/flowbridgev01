/**
 * V15.3 §4/§5/§6 — handoff correlation, freshness and tamper detection.
 *
 * Flow AI can only ever hand a *hint* to a product surface. This module encodes
 * that hint (intent id, economic fingerprint, expiry) into the deep link, and
 * lets the canonical surface decide whether the hint may be used to prefill:
 *
 *  - expired hint            → refuse, require a fresh preparation
 *  - altered economic field  → fingerprint mismatch → refuse
 *  - different chain         → refuse
 *
 * Nothing here grants execution authority: even a FRESH verdict only allows the
 * surface to prefill fields it then re-resolves and re-quotes itself, before the
 * user's own wallet signs.
 *
 * Pure module: no network, no DB, no keys.
 */

export const HANDOFF_PARAMS = {
  intentId: "intent",
  fingerprint: "fp",
  expiresAt: "exp",
  type: "itype",
  chainId: "ichain",
} as const;

/** Deterministic, non-secret 32-bit FNV-1a digest — detects alteration, not forgery. */
export function fingerprintDigest(fingerprint: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < fingerprint.length; i += 1) {
    h ^= fingerprint.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Canonicalized digest input over exactly the fields that travel in the link,
 * plus the registry-resolved target contract. Both the builder and the target
 * surface derive it the same way, so altering any linked economic value breaks
 * the digest.
 */
export function handoffFingerprint(input: {
  type: string;
  chainId: number;
  targetContract: string | null;
  tokenIn?: string | null;
  tokenOut?: string | null;
  amount?: string | null;
  destinationChainId?: number | string | null;
}): string {
  return [
    input.type,
    input.chainId,
    input.targetContract ?? "",
    input.tokenIn ?? "",
    input.tokenOut ?? "",
    input.amount ?? "",
    input.destinationChainId ?? "",
  ]
    .map((f) => String(f).toLowerCase())
    .join("|");
}

export interface HandoffHint {
  intentId: string;
  digest: string;
  expiresAt: string;
  type: string;
  chainId: number;
  /** Economic hints copied from the intent; advisory prefill values only. */
  hints: Readonly<Record<string, string>>;
}

export function parseHandoffHint(search: string): HandoffHint | null {
  const p = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const intentId = p.get(HANDOFF_PARAMS.intentId);
  if (!intentId) return null;
  const chainId = Number(p.get(HANDOFF_PARAMS.chainId) ?? "0");
  const hints: Record<string, string> = {};
  for (const key of ["from", "to", "token", "amount", "dest", "tab", "action"]) {
    const v = p.get(key);
    if (v) hints[key] = v;
  }
  return {
    intentId,
    digest: (p.get(HANDOFF_PARAMS.fingerprint) ?? "").toLowerCase(),
    expiresAt: p.get(HANDOFF_PARAMS.expiresAt) ?? "",
    type: p.get(HANDOFF_PARAMS.type) ?? "",
    chainId: Number.isFinite(chainId) ? chainId : 0,
    hints,
  };
}

export type HandoffVerdict =
  | "FRESH"
  | "EXPIRED"
  | "FINGERPRINT_MISMATCH"
  | "CHAIN_MISMATCH"
  | "MALFORMED";

export interface HandoffEvaluation {
  verdict: HandoffVerdict;
  /** True only for FRESH: the surface may prefill, then must revalidate itself. */
  mayPrefill: boolean;
  /** Never true — a hint is never execution authority. */
  grantsExecution: false;
  message: string;
}

const COPY: Record<HandoffVerdict, string> = {
  FRESH:
    "Flow AI prepared this plan. Trade re-resolves the route, balance, allowance and quote itself before your wallet can sign.",
  EXPIRED:
    "This prepared plan expired. Ask Flow AI to prepare it again — Trade will not reuse a stale simulation.",
  FINGERPRINT_MISMATCH:
    "The linked values no longer match the plan Flow AI prepared and simulated. Ask Flow AI for a fresh preparation.",
  CHAIN_MISMATCH:
    "This plan was prepared for a different network. Switch network or ask Flow AI to prepare it again.",
  MALFORMED: "This handoff link is incomplete, so Trade will ignore it.",
};

/**
 * §5 — the surface recomputes the economic fingerprint from the values it is
 * actually about to use. Any altered field breaks the digest.
 */
export function evaluateHandoff(input: {
  hint: HandoffHint;
  /** Fingerprint recomputed from the values the surface resolved (same field order as economicFingerprint). */
  recomputedFingerprint: string;
  currentChainId: number | null;
  now?: Date;
}): HandoffEvaluation {
  const { hint } = input;
  const now = input.now ?? new Date();
  const verdict: HandoffVerdict = (() => {
    if (!hint.digest || !hint.expiresAt || !hint.chainId) return "MALFORMED";
    if (new Date(hint.expiresAt).getTime() <= now.getTime()) return "EXPIRED";
    if (input.currentChainId !== null && input.currentChainId !== hint.chainId) {
      return "CHAIN_MISMATCH";
    }
    if (fingerprintDigest(input.recomputedFingerprint) !== hint.digest) {
      return "FINGERPRINT_MISMATCH";
    }
    return "FRESH";
  })();

  return {
    verdict,
    mayPrefill: verdict === "FRESH",
    grantsExecution: false,
    message: COPY[verdict],
  };
}

/* ----------------------------- observation store ---------------------------- */

/**
 * §6 — intent→tx correlation is stored as an OBSERVATION. It records what the
 * app watched happen on the normal wallet path; it never changes AI authority
 * semantics and contains no signature, key or token material.
 */
export interface HandoffObservation {
  intentId: string;
  handedOffAt: string;
  observedTxHash: string | null;
  observedOutcome: "PENDING" | "SUCCESS" | "FAILED" | "ABANDONED";
  /** Always the user's own wallet via the Trade surface. */
  submittedBy: "USER_WALLET_VIA_TRADE";
  /** Flow AI never executes; kept explicit for audit readers. */
  executedByAi: false;
}

const STORE_KEY = "flowbridge_ai_handoff_observations";

function readAll(): Record<string, HandoffObservation> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, HandoffObservation>) : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, HandoffObservation>): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORE_KEY, JSON.stringify(all));
  } catch {
    /* observation is best-effort telemetry, never a gate */
  }
}

export function recordHandoffObservation(input: {
  intentId: string;
  observedTxHash?: string | null;
  observedOutcome?: HandoffObservation["observedOutcome"];
}): HandoffObservation {
  const all = readAll();
  const prev = all[input.intentId];
  const next: HandoffObservation = {
    intentId: input.intentId,
    handedOffAt: prev?.handedOffAt ?? new Date().toISOString(),
    observedTxHash: input.observedTxHash ?? prev?.observedTxHash ?? null,
    observedOutcome: input.observedOutcome ?? prev?.observedOutcome ?? "PENDING",
    submittedBy: "USER_WALLET_VIA_TRADE",
    executedByAi: false,
  };
  all[input.intentId] = next;
  writeAll(all);
  return next;
}

export function readHandoffObservation(intentId: string): HandoffObservation | null {
  return readAll()[intentId] ?? null;
}
