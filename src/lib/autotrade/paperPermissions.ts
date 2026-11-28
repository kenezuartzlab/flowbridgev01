/**
 * AutoTrade Ops permissions (pure). Paper actions are simulations: they never
 * reach a signer, registry, live executor or funds. Policy and infrastructure
 * actions stay super-admin only. Roles come only from the server admin gate.
 */
export type OpsRole = "super_admin" | "internal_operator";
export const PAPER_ACTIONS = ["create", "paper_reference"] as const;
export const OWN_PAPER_ORDER_ACTIONS = ["tick", "pause", "resume", "cancel"] as const;
export const SUPER_ADMIN_ACTIONS = ["emergency", "registry_preview", "prepare_canary", "validate_infrastructure"] as const;
export const PAPER_QUOTA = { perHour: 10, activeMax: 5, windowMs: 60 * 60 * 1000 } as const;

export interface OpsPermissions {
  createPaper: boolean; controlOwnPaper: boolean; controlAllPaper: boolean;
  emergency: boolean; canaryReview: boolean; infrastructure: boolean; registryPreview: boolean;
}
export function opsPermissions(role: string | null | undefined): OpsPermissions {
  const known = role === "super_admin" || role === "internal_operator";
  const sa = role === "super_admin";
  return { createPaper: known, controlOwnPaper: known, controlAllPaper: sa, emergency: sa, canaryReview: sa, infrastructure: sa, registryPreview: sa };
}

export type ActionDecision = { ok: true; ownOrderOnly: boolean } | { ok: false; status: 403; error: string };
const SUPER_ONLY_MESSAGE = "This control requires a super admin. Operators can create and manage their own paper orders only.";
export function authorizeAutoTradeAction(role: string | null | undefined, action: unknown): ActionDecision {
  const p = opsPermissions(role);
  if (!p.createPaper) return { ok: false, status: 403, error: "Your account does not have an AutoTrade Ops role." };
  if (typeof action !== "string") return { ok: false, status: 403, error: "Unknown AutoTrade action." };
  if ((PAPER_ACTIONS as readonly string[]).includes(action)) return { ok: true, ownOrderOnly: false };
  if ((OWN_PAPER_ORDER_ACTIONS as readonly string[]).includes(action)) return { ok: true, ownOrderOnly: !p.controlAllPaper };
  if ((SUPER_ADMIN_ACTIONS as readonly string[]).includes(action) && role === "super_admin") return { ok: true, ownOrderOnly: false };
  return { ok: false, status: 403, error: (SUPER_ADMIN_ACTIONS as readonly string[]).includes(action) ? SUPER_ONLY_MESSAGE : "Unknown AutoTrade action." };
}

/** Per-account create limit; counts come from the server, never the browser. */
export function paperQuotaDecision(createdLastHour: number, active: number): { ok: true } | { ok: false; error: string } {
  if (active >= PAPER_QUOTA.activeMax) return { ok: false, error: `You already have ${PAPER_QUOTA.activeMax} active paper orders. Cancel or let one finish before creating another.` };
  if (createdLastHour >= PAPER_QUOTA.perHour) return { ok: false, error: `Paper order limit reached (${PAPER_QUOTA.perHour} per hour per account). Try again later; nothing was saved.` };
  return { ok: true };
}
export const ACTIVE_PAPER_STATES = ["ARMED", "BUY_SUBMITTED", "HOLDING", "SELL_SUBMITTED", "PAUSED"];
