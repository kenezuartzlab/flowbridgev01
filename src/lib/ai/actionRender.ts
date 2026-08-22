/**
 * V15.3H §1/§2 — the canonical assistant response contract.
 *
 * Root cause this module closes: "prepared" used to be a PROSE claim. The model
 * wrote "I've prepared your swap — tap Review on /trade", while the structured
 * plan was prepared by a *separate* client call that could fail, be dropped, or
 * never render. When it did, the user saw instructions for a button that did not
 * exist, and Trade opened empty.
 *
 * From V15.3H, `prepared` has a machine-verifiable meaning:
 *   READY_FOR_USER  ⇔  a schema-valid ActionIntent AND a structured reviewAction
 *
 * If either is missing the response degrades to NOT_READY / ERROR and the prose
 * is replaced by deterministic copy — the model is never the source of a CTA.
 *
 * Pure module: no network, no DB, no keys, no authority. A `reviewAction`
 * carries an intent id, a label and a target route only; never calldata, never
 * a signature, never permission to execute.
 */

export const ASSISTANT_RESPONSE_CONTRACT_VERSION = "flowbridge.assistant-response/1" as const;

export const ASSISTANT_MODES = [
  "INFO",
  "PREPARATION",
  "READY_FOR_USER",
  "NOT_READY",
  "ERROR",
] as const;
export type AssistantMode = (typeof ASSISTANT_MODES)[number];

/** Structured CTA descriptor. The UI renders it; it grants nothing. */
export interface ReviewAction {
  intentId: string;
  label: string;
  /** In-app route path, e.g. `/trade`. */
  route: string;
  /** Router search params (correlation + advisory prefill hints only). */
  search: Record<string, string>;
  surface: string;
}

/** Client-reported outcome of rendering the structured action card. */
export type ActionRenderStatus = "RENDERED" | "RENDER_FAILED" | "NONE";

export const STRUCTURED_ACTION_TESTIDS = {
  card: "ai-action-card",
  cta: "ai-review-in-trade",
  renderFailed: "ai-action-render-failed",
  preparedAvailable: "trade-prepared-action-available",
} as const;

export const NOT_READY_MESSAGE =
  "I could not finish preparing that action, so there is nothing for you to review yet. Nothing was signed or submitted. Ask me to prepare it again, or open /trade and enter the values yourself.";

export const RENDER_FAILED_MESSAGE =
  "I prepared a plan but this screen could not render its review card, so there is no button to tap. Retry the preparation — I will not pretend a control exists.";

/**
 * Builds the structured CTA from a prepared intent's handoff. Splits path from
 * search so the SPA router keeps the correlation hints instead of treating the
 * whole string as a path.
 */
export function buildReviewAction(input: {
  intentId: string;
  href: string;
  cta: string;
  surface: string;
}): ReviewAction | null {
  if (!input.intentId || !input.href) return null;
  const [route, query] = input.href.split("?");
  if (!route.startsWith("/")) return null;
  return {
    intentId: input.intentId,
    label: input.cta || "Review in Trade",
    route,
    search: Object.fromEntries(new URLSearchParams(query ?? "")),
    surface: input.surface || "Trade",
  };
}

export interface StructuredActionInput {
  mode: AssistantMode;
  actionIntent?: {
    id?: unknown;
    type?: unknown;
    chainId?: unknown;
    expiresAt?: unknown;
    fingerprint?: unknown;
    parameters?: unknown;
    simulationResult?: unknown;
    status?: unknown;
  } | null;
  reviewAction?: ReviewAction | null;
}

export interface StructuredActionVerdict {
  ok: boolean;
  /** Degraded mode when validation fails; equals the input mode when it passes. */
  mode: AssistantMode;
  errors: string[];
}

/**
 * §2 — READY_FOR_USER is structurally impossible without a card. Every required
 * field is checked here, on BOTH sides of the wire: the server refuses to
 * serialize an invalid READY_FOR_USER, and the client refuses to render (or to
 * believe) one.
 */
export function validateStructuredAction(input: StructuredActionInput): StructuredActionVerdict {
  if (input.mode !== "READY_FOR_USER") {
    return { ok: true, mode: input.mode, errors: [] };
  }
  const errors: string[] = [];
  const i = input.actionIntent;
  if (!i || typeof i !== "object") {
    errors.push("actionIntent missing");
  } else {
    if (typeof i.id !== "string" || !i.id) errors.push("actionIntent.id missing");
    if (typeof i.type !== "string" || !i.type) errors.push("actionIntent.type missing");
    if (!Number.isInteger(Number(i.chainId))) errors.push("actionIntent.chainId missing");
    if (typeof i.expiresAt !== "string" || Number.isNaN(new Date(String(i.expiresAt)).getTime())) {
      errors.push("actionIntent.expiresAt missing");
    }
    if (typeof i.fingerprint !== "string" || !i.fingerprint) {
      errors.push("actionIntent.fingerprint missing");
    }
    if (!i.parameters || typeof i.parameters !== "object" || Object.keys(i.parameters).length === 0) {
      errors.push("actionIntent.parameters missing");
    }
    const sim = i.simulationResult as { ok?: unknown } | null | undefined;
    if (!sim || typeof sim !== "object" || sim.ok !== true) {
      errors.push("actionIntent.simulationResult not passing");
    }
    if (i.status !== undefined && i.status !== "READY_FOR_USER") {
      errors.push("actionIntent.status is not READY_FOR_USER");
    }
  }
  const r = input.reviewAction;
  if (!r) errors.push("reviewAction missing");
  else {
    if (!r.intentId) errors.push("reviewAction.intentId missing");
    if (!r.label) errors.push("reviewAction.label missing");
    if (!r.route || !r.route.startsWith("/")) errors.push("reviewAction.route invalid");
    if (i && typeof i.id === "string" && r.intentId && r.intentId !== i.id) {
      errors.push("reviewAction.intentId does not match actionIntent.id");
    }
  }
  return errors.length === 0
    ? { ok: true, mode: "READY_FOR_USER", errors: [] }
    : { ok: false, mode: "NOT_READY", errors };
}

/** True when the prose claims a prepared/reviewable action. */
export function claimsPreparedAction(message: string): boolean {
  return /\b(i(?:'ve| have)? prepared|prepared (?:your|the|a) |review (?:it |this )?(?:on|in) \/?trade|tap (?:the )?review|click (?:the )?review)\b/i.test(
    message,
  );
}

/**
 * §2 — when no structured action exists, prose may not imply one. The claim is
 * replaced wholesale rather than patched, so no imaginary button survives.
 */
export function enforceProseHonesty(input: {
  mode: AssistantMode;
  message: string;
  hasStructuredAction: boolean;
}): string {
  if (input.hasStructuredAction && input.mode === "READY_FOR_USER") return input.message;
  if (!claimsPreparedAction(input.message)) return input.message;
  return NOT_READY_MESSAGE;
}

/** True when a prepared handle is still inside its TTL. */
export function preparedHandleUsable(
  handle: { state?: string; expiresAt?: string; handoffHref?: string | null } | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!handle?.expiresAt || !handle.handoffHref) return false;
  if (handle.state && handle.state !== "READY_FOR_USER") return false;
  return new Date(handle.expiresAt).getTime() > now.getTime();
}
