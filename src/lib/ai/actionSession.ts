/**
 * V15.3I §1–§3 — the canonical pending-action session.
 *
 * Root cause of the observed slot loss: the only durable state between turns was
 * `PendingPreparation`, which existed ONLY while a slot was missing. Once the
 * user answered "10", the pending slot was consumed and discarded. A later
 * "Prepare again" therefore arrived as a brand-new sentence with no tokens and
 * no network in it, so `detectPreparationRequest` found nothing and Flow AI fell
 * back to asking "which USDT / which network?" — even though the user had
 * already said USDT → BOT on BOT Testnet.
 *
 * This module models the action session as the durable object: explicit user
 * slots (actionType, chainId, tokenIn, tokenOut, amount) survive a failed
 * preparation, and a retry is a DETERMINISTIC operation over those slots — never
 * a new parsing turn. Volatile preparation output (quote, fee, fee nonce,
 * allowance, simulation, expiry, fingerprint, transient error) is always
 * discarded and re-read live.
 *
 * Nothing here is authoritative: no calldata, no signing, no execution. The
 * server still re-resolves canonical addresses/decimals and reruns balance,
 * allowance, router fee/nonce, quote and `eth_call` simulation before any
 * READY_FOR_USER.
 */
import type { ActionIntentType } from "./actionIntent";
import { tokenFor, type PreparationShape, type PendingField } from "./preparationRouting";

/** An action session lives a little longer than a pending slot: retries need it. */
export const ACTION_SESSION_TTL_MS = 15 * 60_000;

export interface ActionSessionSlots {
  actionType: ActionIntentType;
  chainId: number;
  tokenInSymbol: string | null;
  tokenOutSymbol: string | null;
  destinationChainId: number | null;
  /** Exact user-supplied amount. Never inferred, never defaulted. */
  amount: string | null;
  recognized: string[];
}

export interface PreparationFailure {
  errorCode: PreparationErrorCode;
  stage: PreparationStage;
  retryable: boolean;
  detail: string;
  degraded: string[];
  /** Human-readable echo of what a retry will keep. */
  retainedSlots: string[];
  at: string;
}

export interface ActionSession {
  id: string;
  actorKey: string;
  slots: ActionSessionSlots;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  lastError: PreparationFailure | null;
}

export const PREPARATION_ERROR_CODES = [
  "LIVE_QUOTE_UNAVAILABLE",
  "ALLOWANCE_READ_FAILED",
  "SIMULATION_REVERT",
  "ROUTER_FEE_READ_FAILED",
  "WALLET_MISMATCH",
  "TOKEN_UNSUPPORTED",
  "INSUFFICIENT_BALANCE",
  "POLICY_BLOCKED",
  "EXPIRED",
  "HANDOFF_RENDER_FAILED",
  "PREPARATION_FAILED",
] as const;
export type PreparationErrorCode = (typeof PREPARATION_ERROR_CODES)[number];

export const PREPARATION_STAGES = [
  "SLOTS",
  "REGISTRY",
  "WALLET",
  "BALANCE",
  "ALLOWANCE",
  "FEE",
  "QUOTE",
  "SIMULATION",
  "POLICY",
  "HANDOFF",
  "RENDER",
] as const;
export type PreparationStage = (typeof PREPARATION_STAGES)[number];

/** Free-form retry language. All retry paths funnel into one deterministic op. */
const RETRY_RE =
  /\b(retry|try again|again|re-?prepare|prepare it again|prepare that action again|prepare again|one more time)\b/i;

export function isRetryRequest(text: string): boolean {
  return RETRY_RE.test(text.trim());
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `act_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
  }
}

export function slotsFromShape(shape: PreparationShape): ActionSessionSlots {
  return {
    actionType: shape.type,
    chainId: shape.chainId,
    tokenInSymbol: shape.tokenInSymbol,
    tokenOutSymbol: shape.tokenOutSymbol,
    destinationChainId: shape.destinationChainId,
    amount: shape.amount,
    recognized: [...shape.recognized],
  };
}

export function shapeFromSlots(slots: ActionSessionSlots): PreparationShape {
  const needsAmount =
    slots.actionType === "SWAP" ||
    slots.actionType === "BRIDGE" ||
    slots.actionType === "STAKE_FLOW";
  const missingFields: PendingField[] = needsAmount && !slots.amount ? ["amount"] : [];
  return {
    type: slots.actionType,
    chainId: slots.chainId,
    tokenInSymbol: slots.tokenInSymbol,
    tokenOutSymbol: slots.tokenOutSymbol,
    destinationChainId: slots.destinationChainId,
    amount: slots.amount,
    missingFields,
    recognized: slots.recognized,
  };
}

export function describeSlots(slots: ActionSessionSlots): string[] {
  const out = [`${slots.actionType.replace(/_/g, " ")}`, `chain ${slots.chainId}`];
  if (slots.tokenInSymbol && slots.tokenOutSymbol) {
    out.push(`${slots.tokenInSymbol} → ${slots.tokenOutSymbol}`);
  } else if (slots.tokenInSymbol) {
    out.push(slots.tokenInSymbol);
  }
  if (slots.destinationChainId) out.push(`destination chain ${slots.destinationChainId}`);
  if (slots.amount) out.push(`${slots.amount} ${slots.tokenInSymbol ?? ""}`.trim());
  return out;
}

export function createActionSession(input: {
  shape: PreparationShape;
  actorKey: string;
  now?: Date;
}): ActionSession {
  const now = input.now ?? new Date();
  const iso = now.toISOString();
  return {
    id: newId(),
    actorKey: input.actorKey,
    slots: slotsFromShape(input.shape),
    attempts: 0,
    createdAt: iso,
    updatedAt: iso,
    expiresAt: new Date(now.getTime() + ACTION_SESSION_TTL_MS).toISOString(),
    lastError: null,
  };
}

/** Merges newly supplied slots into an existing session without losing others. */
export function mergeActionSession(input: {
  session: ActionSession;
  shape: PreparationShape;
  now?: Date;
}): ActionSession {
  const now = input.now ?? new Date();
  const prev = input.session.slots;
  const next = slotsFromShape(input.shape);
  const merged: ActionSessionSlots = {
    actionType: next.actionType,
    chainId: next.chainId,
    tokenInSymbol: next.tokenInSymbol ?? prev.tokenInSymbol,
    tokenOutSymbol: next.tokenOutSymbol ?? prev.tokenOutSymbol,
    destinationChainId: next.destinationChainId ?? prev.destinationChainId,
    amount: next.amount ?? (next.actionType === prev.actionType ? prev.amount : null),
    recognized: next.recognized.length > 0 ? next.recognized : prev.recognized,
  };
  return {
    ...input.session,
    slots: merged,
    lastError: null,
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ACTION_SESSION_TTL_MS).toISOString(),
  };
}

export type RetryOutcome =
  | { kind: "NO_SESSION" }
  | { kind: "EXPIRED" }
  | { kind: "CONTEXT_CHANGED" }
  | { kind: "MISSING_SLOT"; session: ActionSession; missing: PendingField[] }
  | { kind: "SLOT_CONFLICT"; session: ActionSession; conflict: string }
  | { kind: "RETRY"; session: ActionSession; shape: PreparationShape };

/**
 * §2 — `retryPendingAction`. Deterministic over the existing session object:
 * explicit slots are retained, volatile preparation output is cleared, and the
 * caller re-resolves canonical data plus every live read. A retained slot that
 * is no longer valid produces the EXACT conflict, never a generic
 * "which token / which network?" question.
 */
export function retryActionSession(input: {
  session: ActionSession | null;
  actorKey: string;
  now?: Date;
}): RetryOutcome {
  const session = input.session;
  if (!session) return { kind: "NO_SESSION" };
  const now = input.now ?? new Date();
  if (new Date(session.expiresAt).getTime() <= now.getTime()) return { kind: "EXPIRED" };
  if (session.actorKey !== input.actorKey) return { kind: "CONTEXT_CHANGED" };

  const slots = session.slots;

  // Revalidate retained slots against the canonical registry for THIS chain.
  for (const symbol of [slots.tokenInSymbol, slots.tokenOutSymbol]) {
    if (!symbol) continue;
    if (!tokenFor(symbol, slots.chainId)) {
      return {
        kind: "SLOT_CONFLICT",
        session,
        conflict: `${symbol} is not a canonical token on chain ${slots.chainId}, so I cannot retry that exact action. Name a token that exists there, or change the network.`,
      };
    }
  }

  const shape = shapeFromSlots(slots);
  if (shape.missingFields.length > 0) {
    return { kind: "MISSING_SLOT", session, missing: [...shape.missingFields] };
  }

  // Clear ONLY volatile output; slots and identity are retained.
  const next: ActionSession = {
    ...session,
    attempts: session.attempts + 1,
    lastError: null,
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ACTION_SESSION_TTL_MS).toISOString(),
  };
  return { kind: "RETRY", session: next, shape };
}

const FAILURE_PATTERNS: readonly {
  re: RegExp;
  errorCode: PreparationErrorCode;
  stage: PreparationStage;
  retryable: boolean;
}[] = [
  { re: /quote|expected out|route|liquidity/i, errorCode: "LIVE_QUOTE_UNAVAILABLE", stage: "QUOTE", retryable: true },
  { re: /allowance/i, errorCode: "ALLOWANCE_READ_FAILED", stage: "ALLOWANCE", retryable: true },
  { re: /simulat|revert|eth_call/i, errorCode: "SIMULATION_REVERT", stage: "SIMULATION", retryable: true },
  { re: /fee|nonce/i, errorCode: "ROUTER_FEE_READ_FAILED", stage: "FEE", retryable: true },
  { re: /wallet|bound|connected|mismatch/i, errorCode: "WALLET_MISMATCH", stage: "WALLET", retryable: false },
  { re: /balance|insufficient/i, errorCode: "INSUFFICIENT_BALANCE", stage: "BALANCE", retryable: false },
  { re: /unsupported|not a canonical|registry|decimals/i, errorCode: "TOKEN_UNSUPPORTED", stage: "REGISTRY", retryable: false },
  { re: /polic|not allowed|blocked|limit/i, errorCode: "POLICY_BLOCKED", stage: "POLICY", retryable: false },
  { re: /expired/i, errorCode: "EXPIRED", stage: "HANDOFF", retryable: true },
  { re: /review target|handoff|render/i, errorCode: "HANDOFF_RENDER_FAILED", stage: "HANDOFF", retryable: true },
];

/**
 * §3 — every preparation failure carries a machine-readable reason so the UI can
 * offer a real Retry and Flow AI can answer "why did preparation fail?".
 */
export function classifyPreparationFailure(input: {
  reasons: readonly string[];
  slots: ActionSessionSlots | null;
  degraded?: readonly string[];
  now?: Date;
}): PreparationFailure {
  const detail = input.reasons.filter(Boolean).join("; ") || "preparation did not complete";
  const match = FAILURE_PATTERNS.find((p) => p.re.test(detail));
  return {
    errorCode: match?.errorCode ?? "PREPARATION_FAILED",
    stage: match?.stage ?? "SIMULATION",
    retryable: match ? match.retryable : true,
    detail: detail.slice(0, 400),
    degraded: [...(input.degraded ?? [])],
    retainedSlots: input.slots ? describeSlots(input.slots) : [],
    at: (input.now ?? new Date()).toISOString(),
  };
}

/** Concise, current (never "cached as of") explanation of a failure. */
export function preparationFailureMessage(failure: PreparationFailure): string {
  const retained =
    failure.retainedSlots.length > 0
      ? ` I kept what you already told me: ${failure.retainedSlots.join(" · ")}.`
      : "";
  const next = failure.retryable
    ? " Tap Retry preparation and I will re-read the live fee, allowance, quote and simulation without asking you to repeat anything."
    : " That one is not retryable as-is — change the value it names and I will prepare it again.";
  return `Preparation stopped at ${failure.stage} (${failure.errorCode}): ${failure.detail}. Nothing was signed or submitted.${retained}${next}`;
}
