/**
 * V15.3D §2/§3 — action confirmation + handoff state machine.
 *
 * Pure module. Once the server has PREPARED an action, the next user turn
 * ("proceed", "authorized", "go ahead") must advance THAT action instead of
 * falling into generic chat. Nothing here grants authority: the only legal
 * completion of a preparation is a review handoff into the product surface,
 * where the user's own wallet signs.
 */
import type { ActionIntentType } from "./actionIntent";

/** A prepared plan stays continuable only while its own intent is still fresh. */
export type PreparationState =
  | "COLLECTING_FIELDS"
  | "PREPARING"
  | "READY_FOR_USER"
  | "HANDED_OFF"
  | "EXPIRED"
  | "REJECTED";

/**
 * Client-carried handle for the last prepared action. It is a HINT: it names an
 * intent, never an authorization, and every economic value is re-resolved by the
 * target surface before signing.
 */
export interface PreparedHandle {
  intentId: string;
  type: ActionIntentType | string;
  chainId: number;
  state: PreparationState;
  expiresAt: string;
  handoffHref: string | null;
  handoffCta: string | null;
  surface: string | null;
  actorKey: string;
}

export type ContinuationKind = "PROCEED" | "CANCEL" | "NONE";

const PROCEED_RE =
  /\b(proceed|authorized?|authorise[d]?|approved?|go ahead|continue|confirm(?:ed|ing)?|do it|let'?s do it|yes please|yes,? do|sign it|send it|next step|i'?m ready|ready)\b/;
const CANCEL_RE = /\b(cancel|stop|abort|never ?mind|forget it|don'?t|discard|drop it)\b/;

/** Bare affirmatives are continuations too, but only as the whole message. */
const BARE_YES_RE = /^(y|ya|yes|yep|yeah|ok|okay|sure|k)[.!]?$/;

export function classifyContinuation(text: string): ContinuationKind {
  const q = text.trim().toLowerCase();
  if (!q) return "NONE";
  if (CANCEL_RE.test(q)) return "CANCEL";
  if (BARE_YES_RE.test(q)) return "PROCEED";
  if (PROCEED_RE.test(q)) return "PROCEED";
  return "NONE";
}

export type ContinuationOutcome =
  | { kind: "NONE" }
  | { kind: "CANCELLED" }
  | { kind: "EXPIRED"; handle: PreparedHandle }
  | { kind: "CONTEXT_CHANGED" }
  | { kind: "RESTATE_READY"; handle: PreparedHandle };

/**
 * Applies the next user turn to a prepared handle. A continuation is only valid
 * for the same actor/wallet/chain context and while the plan is unexpired.
 */
export function resolveContinuation(input: {
  handle: PreparedHandle | null;
  question: string;
  actorKey: string;
  now?: Date;
}): ContinuationOutcome {
  const handle = input.handle;
  if (!handle) return { kind: "NONE" };
  const kind = classifyContinuation(input.question);
  if (kind === "NONE") return { kind: "NONE" };
  if (kind === "CANCEL") return { kind: "CANCELLED" };
  if (handle.actorKey && handle.actorKey !== input.actorKey) return { kind: "CONTEXT_CHANGED" };
  const now = input.now ?? new Date();
  if (
    handle.state === "EXPIRED" ||
    handle.state === "REJECTED" ||
    new Date(handle.expiresAt).getTime() <= now.getTime()
  ) {
    return { kind: "EXPIRED", handle };
  }
  return { kind: "RESTATE_READY", handle };
}

/**
 * Deterministic continuation copy. It can never imply Flow AI will execute: the
 * completion of a preparation is always "open the surface and sign yourself".
 */
export function continuationMessage(outcome: ContinuationOutcome): string | null {
  switch (outcome.kind) {
    case "RESTATE_READY": {
      const where = outcome.handle.surface ?? "the product surface";
      return [
        `Your ${String(outcome.handle.type).replace(/_/g, " ").toLowerCase()} plan is already prepared and simulated — I don't need any further confirmation from you here, because I can't submit it.`,
        `Open ${where} with the review button above: it re-resolves the route, balance, allowance, fee and quote, and your own wallet is the only thing that can authorize the transaction.`,
      ].join(" ");
    }
    case "EXPIRED":
      return "That prepared plan has expired, so I won't reuse it. Tell me the action and exact amount again and I'll prepare a fresh one against current chain state.";
    case "CANCELLED":
      return "Cancelled — I've dropped that prepared plan. Nothing was signed or submitted at any point.";
    case "CONTEXT_CHANGED":
      return "Your wallet or network changed since that plan was prepared, so it no longer applies. Ask me to prepare it again and I'll rebuild it from current state.";
    case "NONE":
      return null;
  }
}

/** Handle built from a prepared-intent response (server or client side). */
export function preparedHandleFrom(input: {
  intentId: string;
  type: ActionIntentType | string;
  chainId: number;
  status: string;
  expiresAt: string;
  handoff: { href: string; cta: string; surface: string } | null;
  actorKey: string;
}): PreparedHandle {
  const state: PreparationState =
    input.status === "READY_FOR_USER"
      ? "READY_FOR_USER"
      : input.status === "HANDED_OFF"
        ? "HANDED_OFF"
        : input.status === "EXPIRED"
          ? "EXPIRED"
          : input.status === "REJECTED"
            ? "REJECTED"
            : "PREPARING";
  return {
    intentId: input.intentId,
    type: input.type,
    chainId: input.chainId,
    state,
    expiresAt: input.expiresAt,
    handoffHref: input.handoff?.href ?? null,
    handoffCta: input.handoff?.cta ?? null,
    surface: input.handoff?.surface ?? null,
    actorKey: input.actorKey,
  };
}
