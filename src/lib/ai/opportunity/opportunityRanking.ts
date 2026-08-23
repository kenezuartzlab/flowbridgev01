/**
 * FlowBridge V16 §6/§9 — deterministic identity, dedup, ranking and
 * dismiss/snooze semantics.
 *
 * Pure module: no network, no storage, no clock of its own (callers pass `now`).
 * The LLM may only re-order items INSIDE a score band and re-phrase `reason`;
 * it can never change score inputs, eligibility or economics.
 */
import type {
  Opportunity,
  OpportunityDomain,
  OpportunityPriority,
  OpportunityReasonCode,
  OpportunityViewState,
  RankedOpportunity,
} from "./opportunityTypes";

/** Stable identity — the same condition always collapses to one card. */
export function opportunityIdentity(input: {
  domain: OpportunityDomain;
  type: string;
  subject: string;
}): string {
  return `${input.domain}:${input.type}:${input.subject}`.toLowerCase();
}

/**
 * Deduplicates by identity, keeping the highest-priority (then most live)
 * variant so Home / Earn / Assistant never show the same claim twice.
 */
const PRIORITY_WEIGHT: Record<OpportunityPriority, number> = {
  CRITICAL: 100,
  HIGH: 70,
  MEDIUM: 40,
  LOW: 15,
};

const PROVENANCE_WEIGHT = { LIVE: 12, CACHED: 6, DEGRADED: 0 } as const;

export function dedupeOpportunities(items: readonly Opportunity[]): Opportunity[] {
  const best = new Map<string, Opportunity>();
  for (const item of items) {
    const current = best.get(item.id);
    if (!current) {
      best.set(item.id, item);
      continue;
    }
    const a = PRIORITY_WEIGHT[item.priority] + PROVENANCE_WEIGHT[item.provenance];
    const b = PRIORITY_WEIGHT[current.priority] + PROVENANCE_WEIGHT[current.provenance];
    if (a > b) best.set(item.id, item);
  }
  return [...best.values()];
}

const REASON_URGENCY: Partial<Record<OpportunityReasonCode, number>> = {
  NETWORK_MISMATCH: 18,
  ACTION_EXPIRED: 16,
  CAMPAIGN_ENDING_SOON: 22,
  NO_BOUND_WALLET: 10,
};

/** Materiality is read from canonical snapshot fields only. */
function materiality(item: Opportunity): number {
  const snap = item.economicSnapshot;
  const candidates = ["valueUsd", "claimableFlow", "flowAmount", "pointsAvailable", "campaignPoints"];
  let best = 0;
  for (const key of candidates) {
    const raw = snap[key];
    if (typeof raw === "number" && Number.isFinite(raw) && raw > best) best = raw;
  }
  if (best <= 0) return 0;
  // Logarithmic so one large number cannot dominate the whole feed.
  return Math.min(30, Math.round(Math.log10(1 + best) * 12));
}

function urgency(item: Opportunity, now: Date): number {
  let score = 0;
  for (const code of item.reasonCodes) score += REASON_URGENCY[code] ?? 0;
  if (item.expiresAt) {
    const hours = (new Date(item.expiresAt).getTime() - now.getTime()) / 3_600_000;
    if (hours <= 0) score += 10;
    else if (hours <= 24) score += 20;
    else if (hours <= 72) score += 10;
  }
  return score;
}

function novelty(item: Opportunity, state: OpportunityViewState | undefined): number {
  if (!state?.lastSeenAt) return 14;
  return new Date(item.createdAt).getTime() > new Date(state.lastSeenAt).getTime() ? 6 : 0;
}

/** Lower friction (a ready preparation path) ranks slightly higher. */
function friction(item: Opportunity): number {
  return item.preparableAction ? 6 : 0;
}

export function scoreOpportunity(input: {
  item: Opportunity;
  state?: OpportunityViewState;
  now: Date;
}): { score: number; scoreReasons: string[] } {
  const { item, state, now } = input;
  const parts: { label: string; value: number }[] = [
    { label: "priority", value: PRIORITY_WEIGHT[item.priority] },
    { label: "urgency", value: urgency(item, now) },
    { label: "materiality", value: materiality(item) },
    { label: "novelty", value: novelty(item, state) },
    { label: "confidence", value: PROVENANCE_WEIGHT[item.provenance] },
    { label: "lowFriction", value: friction(item) },
  ];
  const score = parts.reduce((sum, p) => sum + p.value, 0);
  return {
    score,
    scoreReasons: parts.filter((p) => p.value !== 0).map((p) => `${p.label}+${p.value}`),
  };
}

/** True when presentation state currently hides the item. */
export function isSuppressed(
  item: Opportunity,
  state: OpportunityViewState | undefined,
  now: Date,
): boolean {
  if (!state) return false;
  if (state.snoozedUntil && new Date(state.snoozedUntil).getTime() > now.getTime()) return true;
  if (!state.dismissedAt) return false;
  /**
   * Dismissal is presentation-only and is scoped to the state of the world the
   * user dismissed: if the opportunity was regenerated AFTER the dismissal
   * (materially changed), it returns.
   */
  return new Date(item.createdAt).getTime() <= new Date(state.dismissedAt).getTime();
}

export function rankOpportunities(input: {
  items: readonly Opportunity[];
  states?: readonly OpportunityViewState[];
  now?: Date;
  limit?: number;
}): RankedOpportunity[] {
  const now = input.now ?? new Date();
  const byKey = new Map((input.states ?? []).map((s) => [s.key, s]));
  const deduped = dedupeOpportunities(input.items);
  const ranked = deduped
    .filter((item) => new Date(item.staleAfter).getTime() > now.getTime())
    .filter((item) => !isSuppressed(item, byKey.get(item.id), now))
    .map((item) => ({ ...item, ...scoreOpportunity({ item, state: byKey.get(item.id), now }) }))
    // Ties break on identity so the order is fully deterministic.
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return typeof input.limit === "number" ? ranked.slice(0, input.limit) : ranked;
}

/**
 * Score bands the LLM may re-order within. Anything outside a band keeps its
 * deterministic position.
 */
export function scoreBand(score: number): "URGENT" | "IMPORTANT" | "USEFUL" | "AMBIENT" {
  if (score >= 120) return "URGENT";
  if (score >= 90) return "IMPORTANT";
  if (score >= 55) return "USEFUL";
  return "AMBIENT";
}

/**
 * Applies a model-proposed ordering, keeping it inside the deterministic bands.
 * Unknown ids are ignored; missing ids keep their deterministic order.
 */
export function applyModelOrdering(
  ranked: readonly RankedOpportunity[],
  proposedIds: readonly string[],
): RankedOpportunity[] {
  const bands = new Map<string, RankedOpportunity[]>();
  for (const item of ranked) {
    const band = scoreBand(item.score);
    if (!bands.has(band)) bands.set(band, []);
    bands.get(band)!.push(item);
  }
  const out: RankedOpportunity[] = [];
  for (const [, group] of bands) {
    const ordered = [...group].sort((a, b) => {
      const ai = proposedIds.indexOf(a.id);
      const bi = proposedIds.indexOf(b.id);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    out.push(...ordered);
  }
  return out;
}
