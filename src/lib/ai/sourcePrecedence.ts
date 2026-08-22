/**
 * V15 §6 — documented source precedence + contradiction/temporal reasoning.
 *
 * Precedence policy (highest first):
 *   1. AUTHORITATIVE_STATE — app DB / on-chain reads for live product state
 *   2. OFFICIAL_DOCS       — BOT Chain official docs & announcements
 *   3. PRODUCT_DOCS        — FlowBridge docs/config snapshots
 *   4. PROJECT_SOURCE      — a third-party project's own claim
 *   5. COMMUNITY_SOURCE    — community/third party
 *   6. MODEL_MEMORY        — never sufficient alone
 *
 * Ties broken by recency (`observedAt`). Conflicts are surfaced, never hidden.
 */
import type { EvidenceItem, FreshnessClass, SourceAuthority } from "./aiTypes";

export const SOURCE_PRECEDENCE: readonly SourceAuthority[] = [
  "AUTHORITATIVE_STATE",
  "OFFICIAL_DOCS",
  "PRODUCT_DOCS",
  "PROJECT_SOURCE",
  "COMMUNITY_SOURCE",
  "MODEL_MEMORY",
] as const;

export function authorityRank(authority: SourceAuthority): number {
  const idx = SOURCE_PRECEDENCE.indexOf(authority);
  return idx === -1 ? SOURCE_PRECEDENCE.length : idx;
}

/** Max age (ms) before an evidence item counts as stale for its freshness class. */
export const FRESHNESS_BUDGET_MS: Record<FreshnessClass, number> = {
  REALTIME: 60_000,
  DAILY: 24 * 60 * 60_000,
  SLOW: 30 * 24 * 60 * 60_000,
  STATIC: Number.POSITIVE_INFINITY,
};

export function isStale(item: EvidenceItem, now: Date = new Date()): boolean {
  const budget = FRESHNESS_BUDGET_MS[item.freshness];
  if (!Number.isFinite(budget)) return false;
  const observed = Date.parse(item.observedAt);
  if (Number.isNaN(observed)) return true;
  return now.getTime() - observed > budget;
}

export interface ConflictResolution {
  winner: EvidenceItem;
  losers: readonly EvidenceItem[];
  conflicted: boolean;
  /** Recorded for the audit layer / evidence drawer. */
  note: string | null;
}

/**
 * Resolve competing evidence items that answer the SAME question.
 * Higher authority wins; equal authority → newer wins.
 */
export function resolveConflict(
  items: readonly EvidenceItem[],
  now: Date = new Date(),
): ConflictResolution | null {
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => {
    const byAuthority = authorityRank(a.authority) - authorityRank(b.authority);
    if (byAuthority !== 0) return byAuthority;
    return Date.parse(b.observedAt) - Date.parse(a.observedAt);
  });
  const [winner, ...losers] = sorted;
  const differing = losers.filter((l) => !sameValue(l.value, winner.value));
  const conflicted = differing.length > 0;
  const staleLosers = differing.filter((l) => isStale(l, now));
  return {
    winner,
    losers,
    conflicted,
    note: conflicted
      ? `Sources disagree: using ${winner.label} (${winner.authority})${
          staleLosers.length > 0 ? `; ${staleLosers.length} cached source(s) are stale` : ""
        }`
      : null,
  };
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/** Temporal reasoning: answer "as of" from the evidence, never from now(). */
export function asOfTimestamp(items: readonly EvidenceItem[]): string | null {
  const times = items
    .map((i) => Date.parse(i.observedAt))
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);
  if (times.length === 0) return null;
  return new Date(times[0]).toISOString();
}
