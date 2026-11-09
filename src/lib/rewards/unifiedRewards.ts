/**
 * Single read-only combination of reward figures shown on Home, Earn and Rewards.
 * Pure. V1 figures come from the caller-scoped RewardsSummary (on-chain verified
 * Merkle allocations); V2 figures come from a live verified Vault V2 read. They
 * are disjoint systems, so totals are simple sums — never derived from lifetime
 * Points minus claimed FLOW.
 */
import type { RewardsSummary } from "./rewardsSummary";

export type VaultV2Figures = { claimableWei: bigint; claimedWei: bigint } | null;

export interface UnifiedRewardTotals {
  /** Verified, funded Points not yet allocated to any payout; null = under verification. */
  availablePts: number | null;
  earnedPts: number | null;
  pendingFundingPts: number;
  /** Funded Points held while account reconciliation is under review. */
  reconciliationHeldPts: number;
  heldPts: number;
  /** null until both systems have been read (V2 read failure keeps it unknown). */
  claimableFlow: number | null;
  claimedFlow: number | null;
  v1ClaimableFlow: number;
  v2ClaimableFlow: number | null;
  primary: "CLAIM" | "EARN";
}

const WEI = 10n ** 18n;
const flowFloor = (wei: bigint) => Number(wei / WEI);

export function unifiedRewardTotals(summary: RewardsSummary | null | undefined, v2: VaultV2Figures | undefined, v2Enabled: boolean, reconciliationHeld = false): UnifiedRewardTotals {
  const v1Claimable = summary?.claimableNow ?? 0;
  const v1Claimed = summary?.claimedLifetime ?? null;
  // When V2 is not enabled it contributes exactly 0; when enabled but unread, totals stay unknown.
  const v2Known = !v2Enabled ? { claimableWei: 0n, claimedWei: 0n } : v2 ?? null;
  const v2Claimable = v2Known ? flowFloor(v2Known.claimableWei) : null;
  const claimable = summary && v2Claimable !== null ? v1Claimable + v2Claimable : v2Claimable !== null && v2Claimable > 0 ? v2Claimable : null;
  const claimed = v1Claimed !== null && v2Known ? v1Claimed + flowFloor(v2Known.claimedWei) : null;
  return {
    availablePts: summary && !summary.stale && !reconciliationHeld ? summary.eligibleFundedUnallocated : null,
    reconciliationHeldPts: reconciliationHeld ? summary?.eligibleFundedUnallocated ?? 0 : 0,
    earnedPts: summary ? summary.totalPts : null,
    pendingFundingPts: summary?.pendingFunding ?? 0,
    heldPts: summary?.pendingReview ?? 0,
    claimableFlow: claimable,
    claimedFlow: claimed,
    v1ClaimableFlow: v1Claimable,
    v2ClaimableFlow: v2Claimable,
    primary: v1Claimable > 0 || (v2Claimable ?? 0) > 0 ? "CLAIM" : "EARN",
  };
}
