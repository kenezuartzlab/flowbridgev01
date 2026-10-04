/**
 * Funded Community Growth signup bonus — pure policy (owner-approved, Oct 2026).
 *
 * New eligible signup: +100 FLOW Points (SIGNUP_BONUS_REFEREE).
 * Valid referral:      +100 to the referrer too (REFERRAL_SIGNUP_BONUS).
 * Funded by a hard SIGNUP_BONUS budget; a referred signup needs 200 headroom,
 * a direct signup 100. Never one side only, never negative budget.
 *
 * 1 FLOW Point = 1 FLOW, but only for FUNDED ledger rows, and only once the
 * historical reconciliation + on-chain solvency gate is open.
 */
export const SIGNUP_BONUS_POLICY_VERSION = "FUNDED_SIGNUP_BONUS_V1";
/** Program start. Accounts created before this never receive the bonus. */
export const SIGNUP_BONUS_EFFECTIVE_AT = "2026-10-04T01:00:00.000Z";
export const SIGNUP_BONUS_POINTS = 100;
export const REFERRER_SIGNUP_BONUS_POINTS = 100;
export const SIGNUP_BONUS_INITIAL_BUDGET = 1_000_000;
/** Same-referrer wallet bindings within this window above the limit → REVIEW. */
export const REFERRAL_BURST_WINDOW_MS = 10 * 60 * 1000;
export const REFERRAL_BURST_LIMIT = 3;

export type ReferrerOutcome = "NONE" | "PAY" | "MONTHLY_CAP" | "SELF_REFERRAL" | "LOOP" | "REVIEW";

export interface SignupEligibilityInput {
  userId: string;
  accountCreatedAt: string;
  emailVerified: boolean;
  wallet: string | null;
  alreadyBonusedAccount: boolean;
  alreadyBonusedWallet: boolean;
  referrerId?: string | null;
  referrerWallet?: string | null;
  /** The referrer was itself referred by this user (A→B→A loop). */
  referrerReferredByUser?: boolean;
  referrerRewardedThisMonth?: number;
  referrerAlreadyRewardedForUser?: boolean;
  monthlyCap?: number;
  recentReferrerBindings?: number;
  at?: Date;
}

export interface SignupEligibility {
  eligible: boolean;
  /** Reasons the referee bonus is not (yet) confirmable. */
  blockers: Array<"BEFORE_EFFECTIVE_AT" | "EMAIL_UNVERIFIED" | "NO_WALLET" | "DUPLICATE_ACCOUNT" | "DUPLICATE_WALLET">;
  referrer: ReferrerOutcome;
}

const sameWallet = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

export function evaluateSignupEligibility(i: SignupEligibilityInput): SignupEligibility {
  const blockers: SignupEligibility["blockers"] = [];
  if (Date.parse(i.accountCreatedAt) < Date.parse(SIGNUP_BONUS_EFFECTIVE_AT)) blockers.push("BEFORE_EFFECTIVE_AT");
  if (!i.emailVerified) blockers.push("EMAIL_UNVERIFIED");
  if (!i.wallet) blockers.push("NO_WALLET");
  if (i.alreadyBonusedAccount) blockers.push("DUPLICATE_ACCOUNT");
  if (i.alreadyBonusedWallet) blockers.push("DUPLICATE_WALLET");

  let referrer: ReferrerOutcome = "NONE";
  if (i.referrerId) {
    if (i.referrerId === i.userId || sameWallet(i.referrerWallet, i.wallet)) referrer = "SELF_REFERRAL";
    else if (i.referrerReferredByUser) referrer = "LOOP";
    else if (i.referrerAlreadyRewardedForUser) referrer = "SELF_REFERRAL";
    else if ((i.recentReferrerBindings ?? 0) > REFERRAL_BURST_LIMIT) referrer = "REVIEW";
    else if ((i.referrerRewardedThisMonth ?? 0) >= (i.monthlyCap ?? 10)) referrer = "MONTHLY_CAP";
    else referrer = "PAY";
  }
  return { eligible: blockers.length === 0, blockers, referrer };
}

/** Funding required to confirm: 200 when the referrer is paid, else 100. */
export function requiredSignupFunding(payReferrer: boolean): number {
  return SIGNUP_BONUS_POINTS + (payReferrer ? REFERRER_SIGNUP_BONUS_POINTS : 0);
}

export type BudgetDecision = { outcome: "CONFIRM"; reserve: number } | { outcome: "EXHAUSTED"; remaining: number; required: number };

/** Mirrors award_signup_bonus(): all-or-nothing, never below zero. */
export function decideSignupBudget(total: number, reserved: number, payReferrer: boolean): BudgetDecision {
  const remaining = Math.max(0, total - reserved);
  const required = requiredSignupFunding(payReferrer);
  return remaining >= required ? { outcome: "CONFIRM", reserve: required } : { outcome: "EXHAUSTED", remaining, required };
}

export const SIGNUP_ALLOCATION_EXHAUSTED_COPY = "Signup bonus allocation is currently fully allocated.";
export const SIGNUP_FUNDING_COPY =
  "Available while the funded FlowBridge community-growth allocation remains available.";

// ---------- 1:1 settlement ----------

export interface LedgerRowForClaim {
  points: number;
  funding_state?: string | null;
}

/** Only FUNDED ledger rows count. Stored profile aggregates are never an input. */
export function eligibleBackedPoints(rows: LedgerRowForClaim[]): number {
  return rows.reduce((s, r) => s + (r.funding_state === "FUNDED" ? Math.max(0, Math.floor(Number(r.points) || 0)) : 0), 0);
}

export function unfundedPendingPoints(rows: LedgerRowForClaim[]): number {
  return rows.reduce((s, r) => s + (r.funding_state !== "FUNDED" ? Math.max(0, Math.floor(Number(r.points) || 0)) : 0), 0);
}

/** 1 eligible backed point = 1 FLOW; claimable = backed − already claimed, never negative. */
export function claimableFlowOneToOne(backedPoints: number, alreadyClaimedFlow: number): number {
  return Math.max(0, Math.floor(backedPoints) - Math.floor(alreadyClaimedFlow));
}

export interface ClaimGateInput {
  reconciliationClean: boolean;
  distributorDeployed: boolean;
  /** Verified on-chain FLOW held by the distributor, whole FLOW. null = unread. */
  distributorFlowBalance: number | null;
  totalReservedPoints: number;
}

export type ClaimGateReason = "RECONCILIATION_PENDING" | "DISTRIBUTOR_NOT_DEPLOYED" | "FUNDING_UNVERIFIED" | "UNDERFUNDED";

export function oneToOneClaimGate(g: ClaimGateInput): { open: boolean; reasons: ClaimGateReason[] } {
  const reasons: ClaimGateReason[] = [];
  if (!g.reconciliationClean) reasons.push("RECONCILIATION_PENDING");
  if (!g.distributorDeployed) reasons.push("DISTRIBUTOR_NOT_DEPLOYED");
  if (g.distributorFlowBalance == null) reasons.push("FUNDING_UNVERIFIED");
  else if (g.distributorFlowBalance < g.totalReservedPoints) reasons.push("UNDERFUNDED");
  return { open: reasons.length === 0, reasons };
}

/**
 * Current Mainnet gate facts. Historical reconciliation has not produced a
 * clean report and the Mainnet distributor is still pending promotion, so 1:1
 * claims stay closed. Flip only from a reviewed reconciliation + funding record.
 */
export const MAINNET_CLAIM_GATE_FACTS = {
  reconciliationClean: false,
  distributorDeployed: false,
} as const;
