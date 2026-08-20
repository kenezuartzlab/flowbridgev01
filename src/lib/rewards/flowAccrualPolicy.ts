/**
 * FlowBridge V12.4 — FLOW Points accrual integrity descriptor.
 *
 * This module is DESCRIPTIVE, not a new economic engine. It names the single
 * production accrual path, the authoritative config source for each field, and
 * the unresolved legacy conflicts found in the V12.4 audit. It intentionally
 * changes no live economics: the executed formulas stay in `@/lib/rewards`
 * (`estimateFlowPointsForUsd`, `referralActivityShare`) and in
 * `createTransactionHistory` (the only writer of `profiles.flow_points` for
 * swap/referral activity).
 */

export type AccrualStatus = "economically-active" | "display-only" | "dead-code" | "conflict";

export interface AccrualPolicyField {
  field: string;
  /** Authoritative storage source for the value at runtime. */
  source: string;
  status: AccrualStatus;
  note: string;
}

/** Every reward policy field reachable at runtime and what it actually does. */
export const FLOW_ACCRUAL_POLICY_FIELDS: readonly AccrualPolicyField[] = [
  {
    field: "rewards.minUsd",
    source: "app_settings.rewards (admin /sets) → getRewardSettings()",
    status: "economically-active",
    note: "Minimum verified swap USD before any FLOW Points accrue.",
  },
  {
    field: "rewards.usdBlock",
    source: "app_settings.rewards → getRewardSettings()",
    status: "economically-active",
    note: "USD per point block in estimateFlowPointsForUsd().",
  },
  {
    field: "rewards.pointsPerBlock",
    source: "app_settings.rewards → getRewardSettings()",
    status: "economically-active",
    note: "Points granted per completed USD block.",
  },
  {
    field: "rewards.referralActivityPct",
    source: "app_settings.rewards → getRewardSettings()",
    status: "economically-active",
    note: "Referrer share of the referee's verified swap points (default 20%).",
  },
  {
    field: "rewards.referralClaimMinSwapUsd",
    source: "app_settings.rewards → getRewardSettings()",
    status: "economically-active",
    note: "Swap volume needed to unlock each block of referral-signup points at conversion time.",
  },
  {
    field: "rewards.claimThreshold",
    source: "app_settings.rewards → getRewardSettings()",
    status: "economically-active",
    note: "Minimum claimable points for the off-chain PTS→FLOW conversion.",
  },
  {
    field: "SWAP_DAILY_TIERS / SWAP_MAX_DAILY_PTS (src/lib/points.ts)",
    source: "source constants, rendered on /earn",
    status: "conflict",
    note:
      "Documented daily-tier target policy (max 75 PTS/day). NOT executed by the server; " +
      "the live engine is the uncapped per-USD block formula. Owner approval required to pick one.",
  },
  {
    field: "referral signup bonus (+50 PTS)",
    source: "hardcoded in ensureProfile()/linkReferralIfMissing()",
    status: "conflict",
    note:
      "V12.4 §3 requires a referral relationship alone to grant no economic reward. " +
      "Currently a signup credits the referrer 50 PTS immediately (conversion-gated, not accrual-gated).",
  },
];

export interface AccrualConflict {
  id: string;
  summary: string;
  /** true when the conflict can silently double-credit a user. */
  doubleCreditRisk: boolean;
}

/** Unresolved conflicts. A non-empty list means V12.4 cannot report PASS. */
export const FLOW_ACCRUAL_CONFLICTS: readonly AccrualConflict[] = [
  {
    id: "swap-formula-tiered-vs-block",
    summary:
      "Documented daily-tier swap policy (5/15/30/50/75 PTS, capped) conflicts with the executed " +
      "uncapped per-USD block formula. Only the block formula runs; /earn showed the tiers.",
    doubleCreditRisk: false,
  },
  {
    id: "referral-signup-auto-credit",
    summary:
      "Referral signup auto-credits 50 PTS to the referrer, which V12.4 §3 forbids without an " +
      "explicit approved rule. Left untouched pending owner decision.",
    doubleCreditRisk: false,
  },
];

export const FLOW_ACCRUAL_HAS_UNRESOLVED_CONFLICTS = FLOW_ACCRUAL_CONFLICTS.length > 0;

/**
 * The single production accrual path. Any additional writer of
 * profiles.flow_points for swap/referral activity is a defect.
 */
export const FLOW_ACCRUAL_PRODUCTION_PATH =
  "POST /api/transactions → createTransactionHistory() → verifySwapReceipt() → " +
  "estimateSwapUsd() → estimateFlowPointsForUsd() → profiles.{points_self,flow_points}";

/** Activity classes and whether they may create core FLOW Points. */
export const FLOW_ACCRUAL_ELIGIBILITY = {
  swapVerified: true,
  swapSubThreshold: false,
  bridge: false,
  campaignTask: false,
  referralSignup: "conflict" as const,
  referralActivityShare: true,
} as const;

/**
 * V12.4 §9 — public testnet activation monitoring thresholds. Reporting only;
 * these never touch entitlement accounting.
 */
export const FLOW_DISTRIBUTOR_FUNDED_UNITS = 10_000_000n * 10n ** 18n;
/** Warn below 20% of the funded amount (2,000,000 FLOW). */
export const FLOW_DISTRIBUTOR_LOW_FUNDING_UNITS = (FLOW_DISTRIBUTOR_FUNDED_UNITS * 20n) / 100n;
/** Hard alert below 5% of the funded amount (500,000 FLOW). */
export const FLOW_DISTRIBUTOR_CRITICAL_FUNDING_UNITS = (FLOW_DISTRIBUTOR_FUNDED_UNITS * 5n) / 100n;

export type DistributorFundingLevel = "healthy" | "low" | "critical";

export function distributorFundingLevel(balanceUnits: bigint): DistributorFundingLevel {
  if (balanceUnits < FLOW_DISTRIBUTOR_CRITICAL_FUNDING_UNITS) return "critical";
  if (balanceUnits < FLOW_DISTRIBUTOR_LOW_FUNDING_UNITS) return "low";
  return "healthy";
}

/**
 * Cumulative entitlement is monotonic: a token claim never reduces it, and the
 * distributor only ever pays the incremental difference over claimed[wallet].
 */
export function incrementalPayout(cumulativeEntitlement: bigint, alreadyClaimed: bigint): bigint {
  return cumulativeEntitlement > alreadyClaimed ? cumulativeEntitlement - alreadyClaimed : 0n;
}
