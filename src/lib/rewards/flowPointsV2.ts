/**
 * FlowBridge V12.4A — FLOW Points V2 (owner-approved) canonical accrual policy.
 *
 * Pure, server-authoritative math. No DB, no network, no browser input. The
 * server calls these with values it derived itself from canonical on-chain
 * SwapActivity evidence; browser-submitted amounts never reach here.
 *
 * Versioning invariant: V2 only governs accruals at/after `effectiveAt`.
 * Historical (V1) FLOW Points and the verified V12.3 claim are never rewritten.
 */

export const FLOW_POINTS_V1_VERSION = "FLOW_POINTS_V1" as const;
export const FLOW_POINTS_V2_VERSION = "FLOW_POINTS_V2" as const;

/** Owner-approved activation instant for FLOW Points V2 (UTC). */
export const FLOW_POINTS_V2_EFFECTIVE_AT = "2026-08-20T15:00:00.000Z";

export type LedgerReason =
  | "CORE_SWAP"
  | "DAILY_CAP_REACHED"
  | "REFERRAL_MILESTONE_FIRST_SWAP"
  | "REFERRAL_MILESTONE_VOLUME_100"
  | "REFERRAL_MILESTONE_ACTIVE_DAYS_3";

export type ReferralMilestoneId = "FIRST_SWAP" | "VOLUME_100" | "ACTIVE_DAYS_3";

export interface FlowPointsV2Policy {
  version: typeof FLOW_POINTS_V2_VERSION;
  effectiveAt: string;
  /** Minimum verified USD value of a swap before any points accrue. */
  minSwapUsd: number;
  /** Hard cap of core swap points per bound wallet per UTC day. */
  dailyCoreSwapCap: number;
  /** First qualifying $minSwapUsd+ verified swap by the referred user. */
  referralMilestoneFirstSwap: number;
  /** Cumulative qualified referred volume (USD) milestone and its award. */
  referralMilestoneVolumeUsd: number;
  referralMilestoneVolume: number;
  /** Distinct qualified active days milestone and its award. */
  referralMilestoneActiveDays: number;
  referralMilestoneActiveDaysPoints: number;
  /** Maximum FLOW Points a single referred user can ever generate. */
  referralMaxPerReferredUser: number;
  /** Rewarded referrals per referrer per calendar month. */
  referralMonthlyCap: number;
}

export const DEFAULT_FLOW_POINTS_V2_POLICY: FlowPointsV2Policy = {
  version: FLOW_POINTS_V2_VERSION,
  effectiveAt: FLOW_POINTS_V2_EFFECTIVE_AT,
  minSwapUsd: 5,
  dailyCoreSwapCap: 1000,
  referralMilestoneFirstSwap: 15,
  referralMilestoneVolumeUsd: 100,
  referralMilestoneVolume: 35,
  referralMilestoneActiveDays: 3,
  referralMilestoneActiveDaysPoints: 50,
  referralMaxPerReferredUser: 100,
  referralMonthlyCap: 10,
};

/** True when the given instant is governed by V2 economics. */
export function isFlowPointsV2Active(
  at: Date | string | number = new Date(),
  policy: FlowPointsV2Policy = DEFAULT_FLOW_POINTS_V2_POLICY,
): boolean {
  const t = new Date(at).getTime();
  const from = new Date(policy.effectiveAt).getTime();
  return Number.isFinite(t) && Number.isFinite(from) && t >= from;
}

/** UTC day key ("YYYY-MM-DD") used for the daily core-swap cap. */
export function utcDayKey(at: Date | string | number = new Date()): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** Calendar-month key ("YYYY-MM") used for the referral monthly cap. */
export function utcMonthKey(at: Date | string | number = new Date()): string {
  return new Date(at).toISOString().slice(0, 7);
}

/** Base award before the daily cap: integer floor of verified USD, or 0. */
export function coreSwapBasePoints(
  verifiedUsd: number | null | undefined,
  policy: FlowPointsV2Policy = DEFAULT_FLOW_POINTS_V2_POLICY,
): number {
  const usd = Number(verifiedUsd);
  if (!Number.isFinite(usd) || usd < policy.minSwapUsd) return 0;
  return Math.floor(usd);
}

export interface CoreSwapAward {
  /** Points actually granted for this swap (never negative). */
  award: number;
  /** Uncapped base, for audit/ledger metadata. */
  base: number;
  reason: Extract<LedgerReason, "CORE_SWAP" | "DAILY_CAP_REACHED">;
  /** Remaining daily headroom after this award. */
  remainingToday: number;
}

/**
 * The single V2 core-swap award computation. `alreadyAwardedToday` is the sum of
 * CORE_SWAP ledger points for the same bound wallet on the same UTC day.
 */
export function coreSwapAward(
  verifiedUsd: number | null | undefined,
  alreadyAwardedToday: number,
  policy: FlowPointsV2Policy = DEFAULT_FLOW_POINTS_V2_POLICY,
): CoreSwapAward {
  const base = coreSwapBasePoints(verifiedUsd, policy);
  const used = Math.max(0, Math.floor(Number(alreadyAwardedToday) || 0));
  const headroom = Math.max(0, policy.dailyCoreSwapCap - used);
  const award = Math.min(base, headroom);
  return {
    award,
    base,
    reason: base > 0 && award === 0 ? "DAILY_CAP_REACHED" : "CORE_SWAP",
    remainingToday: Math.max(0, headroom - award),
  };
}

export interface ReferralMilestoneCandidate {
  id: ReferralMilestoneId;
  reason: LedgerReason;
  points: number;
}

export interface RefereeQualifiedState {
  /** Count of qualifying (points-earning) verified swaps, including this one. */
  qualifiedSwapCount: number;
  /** Cumulative qualified verified swap volume in USD. */
  qualifiedVolumeUsd: number;
  /** Distinct UTC days with at least one qualifying swap. */
  qualifiedActiveDays: number;
}

/**
 * Milestones the referrer is eligible for given the referee's qualified state,
 * excluding milestones already granted and respecting the per-referred-user
 * maximum. Idempotency is additionally enforced by a unique DB constraint.
 */
export function referralMilestonesDue(
  state: RefereeQualifiedState,
  alreadyGranted: readonly ReferralMilestoneId[],
  policy: FlowPointsV2Policy = DEFAULT_FLOW_POINTS_V2_POLICY,
): ReferralMilestoneCandidate[] {
  const granted = new Set(alreadyGranted);
  const all: ReferralMilestoneCandidate[] = [];
  if (state.qualifiedSwapCount >= 1) {
    all.push({
      id: "FIRST_SWAP",
      reason: "REFERRAL_MILESTONE_FIRST_SWAP",
      points: policy.referralMilestoneFirstSwap,
    });
  }
  if (state.qualifiedVolumeUsd >= policy.referralMilestoneVolumeUsd) {
    all.push({
      id: "VOLUME_100",
      reason: "REFERRAL_MILESTONE_VOLUME_100",
      points: policy.referralMilestoneVolume,
    });
  }
  if (state.qualifiedActiveDays >= policy.referralMilestoneActiveDays) {
    all.push({
      id: "ACTIVE_DAYS_3",
      reason: "REFERRAL_MILESTONE_ACTIVE_DAYS_3",
      points: policy.referralMilestoneActiveDaysPoints,
    });
  }

  const grantedPoints = all
    .filter((m) => granted.has(m.id))
    .reduce((sum, m) => sum + m.points, 0);
  let budget = Math.max(0, policy.referralMaxPerReferredUser - grantedPoints);

  const due: ReferralMilestoneCandidate[] = [];
  for (const m of all) {
    if (granted.has(m.id)) continue;
    if (m.points > budget) continue;
    due.push(m);
    budget -= m.points;
  }
  return due;
}

/** Referral rewards are blocked once the monthly rewarded-referral cap is hit. */
export function referralMonthlyCapReached(
  rewardedRefereesThisMonth: number,
  refereeAlreadyRewardedThisMonth: boolean,
  policy: FlowPointsV2Policy = DEFAULT_FLOW_POINTS_V2_POLICY,
): boolean {
  if (refereeAlreadyRewardedThisMonth) return false;
  return Math.max(0, Math.floor(Number(rewardedRefereesThisMonth) || 0)) >= policy.referralMonthlyCap;
}

/** Self-referral and unbound-relationship rejection (server-side guard). */
export function referralRelationshipEligible(input: {
  referrerId: string | null | undefined;
  refereeId: string | null | undefined;
  refereeWalletBound: boolean;
}): boolean {
  if (!input.referrerId || !input.refereeId) return false;
  if (input.referrerId === input.refereeId) return false;
  return input.refereeWalletBound;
}

/** V2 disables both legacy referral economics for NEW accruals. */
export const FLOW_POINTS_V2_DISABLED_LEGACY_RULES = [
  "referral-signup-auto-credit-50",
  "referral-activity-percentage-share",
] as const;
