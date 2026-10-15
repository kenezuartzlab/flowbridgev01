/**
 * V36 — operator payout-round status (pure, read-only). A batch is signed ONCE
 * by the authorized publisher; nothing here signs, publishes or schedules.
 */
export type PayoutRoundStatus = "PREPARED" | "AWAITING_SIGNATURE" | "PUBLISHED" | "CLAIM_OPEN" | "CLAIMED" | "EXPIRED";

export interface PayoutRoundInput {
  epochId: number;
  /** Prepared draft exists but no stored batch for it yet. */
  draftOnly?: boolean;
  /** Stored root equals the live on-chain root. */
  publishedOnChain: boolean;
  claimStart: number | null;
  claimEnd: number | null;
  leaves: number;
  claimedLeaves: number | null;
  nowSec: number;
}

export const PAYOUT_ROUND_LABEL: Record<PayoutRoundStatus, string> = {
  PREPARED: "Prepared",
  AWAITING_SIGNATURE: "Awaiting signature",
  PUBLISHED: "Published",
  CLAIM_OPEN: "Claim open",
  CLAIMED: "Claimed",
  EXPIRED: "Expired",
};

export function payoutRoundStatus(r: PayoutRoundInput): PayoutRoundStatus {
  if (r.draftOnly) return "PREPARED";
  if (!r.publishedOnChain || r.claimStart == null || r.claimEnd == null) return "AWAITING_SIGNATURE";
  if (r.leaves > 0 && r.claimedLeaves != null && r.claimedLeaves >= r.leaves) return "CLAIMED";
  if (r.nowSec < r.claimStart) return "PUBLISHED";
  if (r.nowSec <= r.claimEnd) return "CLAIM_OPEN";
  return "EXPIRED";
}
