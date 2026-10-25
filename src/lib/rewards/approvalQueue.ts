/**
 * V37 — user-based Rewards Approval Queue (pure).
 *
 * Decides which accounts may be proposed for an operator-approved payout and
 * who may approve/confirm. Never funds, reserves, signs or publishes anything:
 * funding reservations already exist on FUNDED ledger rows, and confirmation
 * only records the decision and triggers the existing prepare-only settlement
 * builder. Delta math guarantees settled/claimed Points never re-enter.
 */
import { MIN_OPS_CLAIM_FLOW } from "./claimMinimumPolicy";

export type ApprovalStatus = "PROPOSED" | "APPROVED" | "REJECTED" | "CONFIRMED" | "EXPIRED";

export interface ApprovalAccountRow {
  userId: string;
  /** Bound, verified wallet (lowercased). Null = not eligible. */
  wallet: string | null;
  /** Funded Mainnet ledger points (excludes Testnet, unfunded, Campaign PTS, XP). */
  fundedPoints: number;
  /** Reconciled authoritative points. */
  authoritative: number;
  /** Points already allocated in published/stored payout rounds. */
  alreadySettledPoints: number;
  /** Points held for review (blocks). */
  pendingReview: number;
  /** Reconciliation classification; only MATCH / EXPLAINED_DIFFERENCE pass. */
  classification: string;
  /** An open proposal already exists for this account. */
  openProposal: boolean;
}

export type ApprovalExclusion =
  | "NO_WALLET" | "NOTHING_AVAILABLE" | "UNDER_REVIEW" | "NOT_RECONCILED" | "ALREADY_PROPOSED";

export interface ApprovalCandidate {
  userId: string;
  wallet: string;
  /** Verified eligible Points not yet allocated: min(funded, authoritative) − settled. */
  availablePoints: number;
  fundedPoints: number;
  alreadySettledPoints: number;
}

const OK_CLASS = new Set(["MATCH", "EXPLAINED_DIFFERENCE"]);
const floor = (n: number) => Math.max(0, Math.floor(Number(n) || 0));

/** Deterministic: same input ⇒ same order (userId asc). One row per account. */
export function buildApprovalQueue(rows: ApprovalAccountRow[]): {
  candidates: ApprovalCandidate[];
  excluded: { userId: string; reason: ApprovalExclusion; points: number }[];
} {
  const candidates: ApprovalCandidate[] = [];
  const excluded: { userId: string; reason: ApprovalExclusion; points: number }[] = [];
  const seen = new Set<string>();
  const sorted = [...rows].sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
  for (const r of sorted) {
    if (seen.has(r.userId)) { excluded.push({ userId: r.userId, reason: "NOT_RECONCILED", points: 0 }); continue; }
    seen.add(r.userId);
    const backed = Math.min(floor(r.fundedPoints), floor(r.authoritative));
    const available = Math.max(0, backed - floor(r.alreadySettledPoints));
    const ex = (reason: ApprovalExclusion) => excluded.push({ userId: r.userId, reason, points: available });
    if (!r.wallet) { ex("NO_WALLET"); continue; }
    if (r.openProposal) { ex("ALREADY_PROPOSED"); continue; }
    if (!OK_CLASS.has(r.classification)) { ex("NOT_RECONCILED"); continue; }
    if (floor(r.pendingReview) > 0) { ex("UNDER_REVIEW"); continue; }
    if (available < MIN_OPS_CLAIM_FLOW) { ex("NOTHING_AVAILABLE"); continue; }
    candidates.push({
      userId: r.userId, wallet: r.wallet.toLowerCase(), availablePoints: available,
      fundedPoints: backed, alreadySettledPoints: floor(r.alreadySettledPoints),
    });
  }
  return { candidates, excluded };
}

/** A proposed amount must be positive and never exceed the verified available delta. */
export function proposedAmountValid(availablePoints: number, proposedPoints: number): boolean {
  const p = Math.floor(Number(proposedPoints) || 0);
  return p >= MIN_OPS_CLAIM_FLOW && p <= floor(availablePoints);
}

export interface ApprovalLike {
  status: string;
  proposed_by: string | null;
  user_id: string;
  points: number;
  wallet: string;
  evidence_hash: string;
}

/**
 * Proposer/approver separation, mirroring the funding snapshots:
 * propose = any admin; approve/reject = super admin who is NOT the proposer;
 * confirm = super admin (hash-checked, single transition APPROVED → CONFIRMED).
 */
export function payoutApprovalDecision(
  s: ApprovalLike,
  actor: { userId: string; role: "super_admin" | "internal_operator" },
  action: "approve" | "reject" | "confirm",
): { ok: true } | { ok: false; reason: string } {
  if (actor.role !== "super_admin") return { ok: false, reason: "Only a super admin can decide payout approvals." };
  if (action === "confirm") {
    if (s.status !== "APPROVED") return { ok: false, reason: `Approval is ${s.status}.` };
    return { ok: true };
  }
  if (s.status !== "PROPOSED") return { ok: false, reason: `Approval is ${s.status}.` };
  if (s.proposed_by && s.proposed_by === actor.userId) return { ok: false, reason: "The proposer cannot decide their own payout approval." };
  return { ok: true };
}

/** Stable evidence hash input: amount/wallet/account facts at proposal time. */
export function approvalEvidence(c: ApprovalCandidate, proposedPoints: number): Record<string, unknown> {
  return {
    userId: c.userId, wallet: c.wallet, proposedPoints: Math.floor(proposedPoints),
    availablePoints: c.availablePoints, fundedPoints: c.fundedPoints,
    alreadySettledPoints: c.alreadySettledPoints,
  };
}
