/**
 * V36.10 — Funding queue + funding approval rules (pure).
 * Decides which UNFUNDED ledger rows may be proposed for off-chain funding,
 * and who may approve/confirm a funding snapshot. Never funds anything itself.
 */
import { OWNER_REVIEW_DECISIONS } from "./historicalReconciliation";

export const FUNDABLE_POLICY_VERSIONS = new Set(["FLOW_POINTS_V2"]);
export const MAINNET_CHAIN_ID = 677;

export interface QueueLedgerRow {
  id: string; user_id: string; points: number; reason: string; chain_id: number | null;
  funding_state: string | null; reservation_id: string | null; program_id: string | null;
  policy_version: string | null; wallet_address: string | null; tx_hash: string | null;
  verified_activity_id: string | null; created_at: string; provenance_state?: string | null;
}

export type ExclusionReason =
  | "REVIEWED_HISTORICAL_ACCOUNT" | "WALLET_MISMATCH" | "NO_BOUND_WALLET" | "NOT_MAINNET"
  | "PROVENANCE_REVIEW_REQUIRED" | "MISSING_EVIDENCE" | "POLICY_VERSION" | "DUPLICATE_EVIDENCE" | "PROGRAM_CONFLICT" | "NEEDS_MANUAL_REVIEW";

export interface QueueItem { id: string; userId: string; points: number; programId: string; labelFromNull: boolean; createdAt: string }
export interface FundingQueue {
  eligible: Record<string, QueueItem[]>;
  excluded: { id: string; programId: string | null; points: number; reason: ExclusionReason }[];
}

export function programForReason(reason: string): string | null {
  if ((reason === "CORE_SWAP" || reason === "CORE_SWAP_V2")) return "CORE_SWAP";
  if (reason.startsWith("REFERRAL_MILESTONE")) return "REFERRAL_MILESTONE";
  if (reason === "SIGNUP_BONUS_REFEREE" || reason === "REFERRAL_SIGNUP_BONUS") return "SIGNUP_BONUS";
  return null;
}

export function buildFundingQueue(
  rows: QueueLedgerRow[],
  boundWallets: Map<string, string | null>,
  reviewed: ReadonlyMap<string, unknown> = OWNER_REVIEW_DECISIONS,
): FundingQueue {
  const out: FundingQueue = { eligible: {}, excluded: [] };
  const seen = new Map<string, number>();
  for (const r of rows) if (r.tx_hash) seen.set(`${r.tx_hash}|${r.reason}`, (seen.get(`${r.tx_hash}|${r.reason}`) ?? 0) + 1);
  const sorted = [...rows].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1));
  for (const r of sorted) {
    if (r.funding_state !== "UNFUNDED" || r.reservation_id || !(r.points > 0)) continue;
    const program = programForReason(r.reason);
    const ex = (reason: ExclusionReason) => out.excluded.push({ id: r.id, programId: program, points: r.points, reason });
    if (!program || (r.program_id && r.program_id !== program)) { ex("PROGRAM_CONFLICT"); continue; }
    // Only verified Mainnet swap evidence is fundable from the queue; milestones
    // and signup awards keep their own reviewed paths.
    if (program !== "CORE_SWAP") { ex("NEEDS_MANUAL_REVIEW"); continue; }
    if (reviewed.has(r.user_id)) { ex("REVIEWED_HISTORICAL_ACCOUNT"); continue; }
    if (r.chain_id !== MAINNET_CHAIN_ID) { ex("NOT_MAINNET"); continue; }
    if (r.provenance_state !== "VERIFIED" && r.provenance_state !== "EXCEPTION_APPROVED") { ex("PROVENANCE_REVIEW_REQUIRED"); continue; }
    if (!r.tx_hash || !r.verified_activity_id) { ex("MISSING_EVIDENCE"); continue; }
    if (!FUNDABLE_POLICY_VERSIONS.has(r.policy_version ?? "")) { ex("POLICY_VERSION"); continue; }
    if ((seen.get(`${r.tx_hash}|${r.reason}`) ?? 0) > 1) { ex("DUPLICATE_EVIDENCE"); continue; }
    const bound = (boundWallets.get(r.user_id) ?? "").toLowerCase();
    if (!bound) { ex("NO_BOUND_WALLET"); continue; }
    if ((r.wallet_address ?? "").toLowerCase() !== bound) { ex("WALLET_MISMATCH"); continue; }
    (out.eligible[program] ??= []).push({ id: r.id, userId: r.user_id, points: r.points, programId: program, labelFromNull: !r.program_id, createdAt: r.created_at });
  }
  return out;
}

export type OpsRole = "super_admin" | "internal_operator";
export interface SnapshotLike { status: string; proposed_by: string | null; total_points: number; program_id: string }

/** Proposing is open to any admin; approving requires super admin and a different person than the proposer. */
export function approvalDecision(s: SnapshotLike, actor: { userId: string; role: OpsRole }): { ok: true } | { ok: false; reason: string } {
  if (actor.role !== "super_admin") return { ok: false, reason: "Only a super admin can approve funding." };
  if (s.status !== "PROPOSED") return { ok: false, reason: `Snapshot is ${s.status}.` };
  if (s.proposed_by && s.proposed_by === actor.userId) return { ok: false, reason: "The proposer cannot approve their own funding snapshot." };
  return { ok: true };
}

/** Funding must fit the program ceiling AND the free distributor backing after existing reservations. */
export function capacityCheck(args: { need: number; programRemaining: number; freeBackingFlow: number | null; outstandingReservedPoints: number }) {
  const checks = [
    { id: "PROGRAM_CEILING", pass: args.need <= args.programRemaining, detail: `${args.need} needed, ${args.programRemaining} left in program` },
    { id: "BACKING", pass: args.freeBackingFlow !== null && args.need <= args.freeBackingFlow - args.outstandingReservedPoints, detail: args.freeBackingFlow === null ? "Distributor unreadable" : `${args.freeBackingFlow - args.outstandingReservedPoints} FLOW unencumbered` },
  ];
  return { ok: checks.every((c) => c.pass), checks };
}
