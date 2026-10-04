/**
 * Historical FLOW Points reconciliation (pure, deterministic).
 *
 * Rebuilds each account's Mainnet FLOW Points ONLY from ledger evidence and
 * compares it with the stored profile aggregate, which is never trusted
 * (it was user-writable before the hardening migrations). Nothing here
 * writes, overwrites or "fixes" a balance — mismatches are classified for
 * human review.
 */

export const MAINNET_CHAIN_ID = 677;
export const SIGNUP_POLICY_EFFECTIVE_AT = "2026-10-04T01:00:00Z";
export const LEGACY_SIGNUP_DIRECT_CREDIT = 50;

export type ReconClass =
  | "MATCH"
  | "EXPLAINED_DIFFERENCE"
  | "UNEXPLAINED_POSITIVE_DIFFERENCE"
  | "UNEXPLAINED_NEGATIVE_DIFFERENCE"
  | "INSUFFICIENT_HISTORICAL_EVIDENCE";

export interface ReconLedgerRow {
  id: string;
  reason: string;
  points: number;
  chainId: number | null;
  createdAt: string;
  /** Canonical dedup identity (tx/log or activity key). */
  evidenceKey: string | null;
  verifiedUsd: number | null;
  dayKey: string | null;
  refereeId: string | null;
  reservationId: string | null;
  fundingState: string | null;
}

export interface ReconAccountInput {
  userId: string;
  createdAt: string;
  storedFlowPoints: number;
  storedPointsSelf: number;
  storedReferralSignup: number;
  ledger: ReconLedgerRow[];
}

export interface ReconBreakdown {
  coreSwap: number;
  referralSignup: number;
  referralMilestone: number;
  validLegacy: number;
  ledgerBackedAdjustments: number;
}

export interface ReconExclusion { rowId: string; reason: string; cause: string; points: number }

export interface ReconAccountResult {
  userId: string;
  stored: number;
  authoritative: number;
  breakdown: ReconBreakdown;
  pendingReview: number;
  excluded: ReconExclusion[];
  explained: string[];
  flags: string[];
  difference: number;
  classification: ReconClass;
}

const CORE_SWAP = new Set(["CORE_SWAP", "CORE_SWAP_V2"]);
const SIGNUP = new Set(["SIGNUP_BONUS_REFEREE", "REFERRAL_SIGNUP_BONUS"]);
const MILESTONE: Record<string, "FIRST_SWAP" | "VOLUME_100" | "ACTIVE_DAYS_3"> = {
  REFERRAL_MILESTONE_FIRST_SWAP: "FIRST_SWAP",
  REFERRAL_MILESTONE_VOLUME_100: "VOLUME_100",
  REFERRAL_MILESTONE_ACTIVE_DAYS_3: "ACTIVE_DAYS_3",
  REFERRAL_3_ACTIVE_DAYS: "ACTIVE_DAYS_3",
};
export const MILESTONE_POINTS = { FIRST_SWAP: 15, VOLUME_100: 35, ACTIVE_DAYS_3: 50 } as const;

/** Qualifying Mainnet core-swap evidence for a user (deduped, > 0 points). */
export function mainnetSwapEvidence(rows: ReconLedgerRow[]): ReconLedgerRow[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (!CORE_SWAP.has(r.reason) || r.chainId !== MAINNET_CHAIN_ID || r.points <= 0) return false;
    const key = r.evidenceKey ?? r.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Did the referee's Mainnet evidence satisfy the milestone at or before `at`? */
export function milestoneSupported(
  kind: "FIRST_SWAP" | "VOLUME_100" | "ACTIVE_DAYS_3",
  refereeEvidence: ReconLedgerRow[],
  at: string,
): boolean {
  const before = refereeEvidence.filter((r) => r.createdAt <= at);
  if (kind === "FIRST_SWAP") return before.length > 0;
  if (kind === "VOLUME_100") return before.reduce((s, r) => s + (r.verifiedUsd ?? 0), 0) >= 100;
  const days = new Set(before.map((r) => r.dayKey ?? r.createdAt.slice(0, 10)));
  return days.size >= 3;
}

export function reconcileAccount(
  acct: ReconAccountInput,
  evidenceByUser: Map<string, ReconLedgerRow[]>,
): ReconAccountResult {
  const b: ReconBreakdown = { coreSwap: 0, referralSignup: 0, referralMilestone: 0, validLegacy: 0, ledgerBackedAdjustments: 0 };
  const excluded: ReconExclusion[] = [];
  const explained: string[] = [];
  const flags: string[] = [];
  let pendingReview = 0;
  const own = mainnetSwapEvidence(acct.ledger);
  const ownIds = new Set(own.map((r) => r.id));
  const signupSeen = new Set<string>();
  const milestoneSeen = new Set<string>();

  for (const r of acct.ledger) {
    if (r.points === 0) continue;
    if (CORE_SWAP.has(r.reason)) {
      if (ownIds.has(r.id)) b.coreSwap += r.points;
      else excluded.push({ rowId: r.id, reason: r.reason, points: r.points, cause: r.chainId === MAINNET_CHAIN_ID ? "DUPLICATE_EVIDENCE" : `NON_MAINNET_CHAIN_${r.chainId ?? "NULL"}` });
      continue;
    }
    if (SIGNUP.has(r.reason)) {
      const okAmount = r.points === 100;
      const okTime = acct.createdAt >= SIGNUP_POLICY_EFFECTIVE_AT || r.reason === "REFERRAL_SIGNUP_BONUS";
      if (okAmount && okTime && r.reservationId && !signupSeen.has(r.reason + (r.refereeId ?? ""))) {
        signupSeen.add(r.reason + (r.refereeId ?? ""));
        b.referralSignup += r.points;
      } else {
        pendingReview += r.points;
        flags.push(`SIGNUP_AWARD_INVALID:${r.id}`);
      }
      continue;
    }
    const kind = MILESTONE[r.reason];
    if (kind) {
      const dedup = `${kind}:${r.refereeId ?? "?"}`;
      if (milestoneSeen.has(dedup)) { excluded.push({ rowId: r.id, reason: r.reason, points: r.points, cause: "DUPLICATE_MILESTONE" }); flags.push("DUPLICATE_REFERRAL_MILESTONE"); continue; }
      milestoneSeen.add(dedup);
      if (r.points !== MILESTONE_POINTS[kind]) { pendingReview += r.points; flags.push(`MILESTONE_AMOUNT_MISMATCH:${r.id}`); continue; }
      const ev = r.refereeId ? (evidenceByUser.get(r.refereeId) ?? []) : [];
      if (r.refereeId && milestoneSupported(kind, ev, r.createdAt)) b.referralMilestone += r.points;
      else { pendingReview += r.points; flags.push(`MILESTONE_WITHOUT_MAINNET_EVIDENCE:${kind}`); }
      continue;
    }
    if (r.reason === "ADMIN_ADJUSTMENT" && r.evidenceKey) { b.ledgerBackedAdjustments += r.points; continue; }
    excluded.push({ rowId: r.id, reason: r.reason, points: r.points, cause: "UNRECOGNISED_REASON" });
  }

  if (b.referralMilestone > 0) {
    const perReferee = new Map<string, number>();
    for (const r of acct.ledger) if (MILESTONE[r.reason] && r.refereeId) perReferee.set(r.refereeId, (perReferee.get(r.refereeId) ?? 0) + r.points);
    if ([...perReferee.values()].some((v) => v > 100)) flags.push("MILESTONE_OVER_100_PER_REFEREE");
  }

  const authoritative = b.coreSwap + b.referralSignup + b.referralMilestone + b.validLegacy + b.ledgerBackedAdjustments;
  const difference = acct.storedFlowPoints - authoritative;

  // Known, documented legacy explanations (never counted as backed points).
  let explainedAmount = 0;
  const legacySignup = acct.createdAt < SIGNUP_POLICY_EFFECTIVE_AT && acct.storedPointsSelf >= LEGACY_SIGNUP_DIRECT_CREDIT;
  if (legacySignup && difference >= LEGACY_SIGNUP_DIRECT_CREDIT && acct.storedFlowPoints === LEGACY_SIGNUP_DIRECT_CREDIT && acct.ledger.length === 0) {
    explainedAmount = LEGACY_SIGNUP_DIRECT_CREDIT;
    explained.push("LEGACY_SIGNUP_DIRECT_CREDIT_50 (retired server trigger; not ledger-backed, not claimable)");
  }
  if (excluded.some((e) => e.cause.startsWith("NON_MAINNET"))) explained.push("BOT_TESTNET_LEDGER_ROWS_EXCLUDED");

  if (acct.storedFlowPoints > 0 && acct.ledger.length === 0 && !explainedAmount) flags.push("STORED_BALANCE_WITHOUT_LEDGER");
  if (acct.storedReferralSignup > 0) flags.push("LEGACY_REFERRAL_SIGNUP_AGGREGATE");

  let classification: ReconClass;
  if (pendingReview > 0) classification = "INSUFFICIENT_HISTORICAL_EVIDENCE";
  else if (difference === 0) classification = "MATCH";
  else if (difference === explainedAmount) classification = "EXPLAINED_DIFFERENCE";
  else classification = difference > 0 ? "UNEXPLAINED_POSITIVE_DIFFERENCE" : "UNEXPLAINED_NEGATIVE_DIFFERENCE";
  if (classification !== "MATCH" && classification !== "EXPLAINED_DIFFERENCE" && difference > 0) flags.push("STORED_EXCEEDS_LEDGER");

  return { userId: acct.userId, stored: acct.storedFlowPoints, authoritative, breakdown: b, pendingReview, excluded, explained, flags, difference, classification };
}

export interface ReconSummary {
  accounts: number;
  counts: Record<ReconClass, number>;
  authoritativeTotal: number;
  storedTotal: number;
  pendingReviewTotal: number;
  pass: boolean;
  results: ReconAccountResult[];
}

export function reconcileAll(accounts: ReconAccountInput[]): ReconSummary {
  const evidence = new Map(accounts.map((a) => [a.userId, mainnetSwapEvidence(a.ledger)]));
  const results = accounts.map((a) => reconcileAccount(a, evidence));
  const counts: Record<ReconClass, number> = {
    MATCH: 0, EXPLAINED_DIFFERENCE: 0, UNEXPLAINED_POSITIVE_DIFFERENCE: 0, UNEXPLAINED_NEGATIVE_DIFFERENCE: 0, INSUFFICIENT_HISTORICAL_EVIDENCE: 0,
  };
  for (const r of results) counts[r.classification]++;
  return {
    accounts: results.length,
    counts,
    authoritativeTotal: results.reduce((s, r) => s + r.authoritative, 0),
    storedTotal: results.reduce((s, r) => s + r.stored, 0),
    pendingReviewTotal: results.reduce((s, r) => s + r.pendingReview, 0),
    pass: counts.UNEXPLAINED_POSITIVE_DIFFERENCE + counts.UNEXPLAINED_NEGATIVE_DIFFERENCE + counts.INSUFFICIENT_HISTORICAL_EVIDENCE === 0,
    results,
  };
}
