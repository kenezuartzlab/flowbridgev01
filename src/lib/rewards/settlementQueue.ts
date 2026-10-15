/**
 * V36.3 — automatic settlement queue + publisher mode (pure).
 *
 * Wallets with >= minimum funded, eligible, unallocated Points are queued
 * automatically from server facts. Publishing stays human-signed: the
 * publisher mode is DRY_RUN or ONE_CLICK; AUTONOMOUS is not selectable until
 * a separately approved signer exists. Nothing here signs or broadcasts.
 */
import { MAINNET_MIN_CLAIM_FLOW } from "./claimMinimumPolicy";

export type QueueState =
  | "ELIGIBLE" | "QUEUED" | "PREPARED" | "PUBLISHING" | "PUBLISHED" | "OPEN" | "CLAIMED" | "EXPIRED" | "FAILED" | "QUARANTINED";

const NEXT: Record<QueueState, QueueState[]> = {
  ELIGIBLE: ["QUEUED", "QUARANTINED"],
  QUEUED: ["PREPARED", "QUARANTINED"],
  PREPARED: ["PUBLISHING", "QUEUED", "QUARANTINED"],
  PUBLISHING: ["PUBLISHED", "FAILED"],
  PUBLISHED: ["OPEN"],
  OPEN: ["CLAIMED", "EXPIRED"],
  FAILED: ["QUEUED"],
  QUARANTINED: ["QUEUED"],
  CLAIMED: [],
  EXPIRED: [],
};

export function canTransition(from: QueueState, to: QueueState): boolean {
  return NEXT[from].includes(to);
}

export type PublisherMode = "DRY_RUN" | "ONE_CLICK";
/** Autonomous on-chain signing is OFF and not representable as an active mode. */
export const PUBLISHER_CONFIG = Object.freeze({
  mode: "ONE_CLICK" as PublisherMode,
  autonomousSigning: false,
  sweepMinutes: 5,
  batchScheduleMinutes: 15,
  maxWalletsPerEpoch: 200,
  maxFlowPerEpoch: 250_000,
  maxFlowPerDay: 500_000,
});

export interface QueueCandidate {
  userId: string;
  wallet: string | null;
  eligibleFundedUnallocated: number;
  underReview: boolean;
  alreadyQueuedEpoch: number | null;
}

export interface QueueResult {
  queued: { userId: string; wallet: string; points: number }[];
  quarantined: { userId: string; reason: string }[];
  skipped: { userId: string; reason: string }[];
  circuitBreaker: string | null;
}

/** Deterministic, idempotent queueing. Same input ⇒ same output order. */
export function buildSettlementQueue(
  rows: QueueCandidate[],
  opts: { minimum?: number; flowPublishedToday?: number; config?: typeof PUBLISHER_CONFIG } = {},
): QueueResult {
  const min = opts.minimum ?? MAINNET_MIN_CLAIM_FLOW;
  const cfg = opts.config ?? PUBLISHER_CONFIG;
  const out: QueueResult = { queued: [], quarantined: [], skipped: [], circuitBreaker: null };
  const users = new Set<string>();
  const wallets = new Map<string, number>();
  for (const r of rows) if (r.wallet) wallets.set(r.wallet.toLowerCase(), (wallets.get(r.wallet.toLowerCase()) ?? 0) + 1);
  const sorted = [...rows].sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
  for (const r of sorted) {
    if (users.has(r.userId)) { out.quarantined.push({ userId: r.userId, reason: "DUPLICATE_ACCOUNT" }); continue; }
    users.add(r.userId);
    const pts = Math.floor(Number(r.eligibleFundedUnallocated) || 0);
    if (r.alreadyQueuedEpoch != null) { out.skipped.push({ userId: r.userId, reason: "ALREADY_QUEUED" }); continue; }
    if (pts < min) { out.skipped.push({ userId: r.userId, reason: "BELOW_MINIMUM" }); continue; }
    if (!r.wallet) { out.skipped.push({ userId: r.userId, reason: "NO_WALLET" }); continue; }
    if (r.underReview) { out.quarantined.push({ userId: r.userId, reason: "UNDER_REVIEW" }); continue; }
    if ((wallets.get(r.wallet.toLowerCase()) ?? 0) > 1) { out.quarantined.push({ userId: r.userId, reason: "DUPLICATE_WALLET" }); continue; }
    out.queued.push({ userId: r.userId, wallet: r.wallet.toLowerCase(), points: pts });
  }
  const total = out.queued.reduce((s, q) => s + q.points, 0);
  if (out.queued.length > cfg.maxWalletsPerEpoch) out.circuitBreaker = "MAX_WALLETS_EXCEEDED";
  else if (total > cfg.maxFlowPerEpoch) out.circuitBreaker = "EPOCH_CAP_EXCEEDED";
  else if (total + (opts.flowPublishedToday ?? 0) > cfg.maxFlowPerDay) out.circuitBreaker = "DAILY_CAP_EXCEEDED";
  return out;
}
