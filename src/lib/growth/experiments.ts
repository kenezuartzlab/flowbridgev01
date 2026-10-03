/**
 * Growth V1 — UX/copy-only experiment framework.
 * Experiments touching fees, slippage, approvals, routing, wallet permissions,
 * contracts or hidden charges are rejected at registry load.
 */
export const ALLOWED_EXPERIMENT_SCOPES = ["cta_wording", "education_order", "card_placement", "onboarding_flow", "explanation_format"] as const;
export type ExperimentScope = (typeof ALLOWED_EXPERIMENT_SCOPES)[number];
export const FORBIDDEN_TOPICS = ["fee", "slippage", "approval", "router", "route_selection", "wallet_permission", "contract", "security", "hidden_charge", "gas"] as const;

export interface Experiment { id: string; scope: string; variants: readonly string[]; touches?: readonly string[] }

export function validateExperiment(e: Experiment): { ok: true } | { ok: false; reason: string } {
  if (!(ALLOWED_EXPERIMENT_SCOPES as readonly string[]).includes(e.scope)) return { ok: false, reason: "SCOPE_NOT_ALLOWED" };
  const text = [e.id, ...(e.touches ?? [])].join(" ").toLowerCase();
  if (FORBIDDEN_TOPICS.some((t) => text.includes(t))) return { ok: false, reason: "FORBIDDEN_TOPIC" };
  if (e.variants.length < 2 || e.variants.length > 4) return { ok: false, reason: "BAD_VARIANTS" };
  return { ok: true };
}

export function buildRegistry(list: readonly Experiment[]): Experiment[] {
  for (const e of list) {
    const v = validateExperiment(e);
    if (!v.ok) throw new Error(`Experiment ${e.id} rejected: ${v.reason}`);
  }
  return [...list];
}

export const EXPERIMENTS = buildRegistry([
  { id: "home_first_trade_cta", scope: "cta_wording", variants: ["Find a route", "Make your first trade"] },
]);

/** Deterministic, pseudonymous: hash of the random browser session id only. */
export function assignVariant(e: Experiment, sessionHash: string): string {
  let h = 2166136261;
  for (const c of `${e.id}:${sessionHash}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return e.variants[(h >>> 0) % e.variants.length]!;
}
