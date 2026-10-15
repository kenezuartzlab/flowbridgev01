/**
 * V36 — one source of truth for the four reward balances (pure).
 *
 * Built only from the server RewardProgression (funded + reconciled ledger and
 * live on-chain allocations). Nothing here authorizes a claim: `claimableNow`
 * is non-zero ONLY for a published, open, unclaimed, proof-valid allocation.
 * Daily earnings are a subset of total points, never an extra balance.
 */
import type { ProgressionAllocation, RewardProgression } from "./rewardProgression";

export type RewardBlocker =
  | "CLAIM_OPEN"
  | "STATE_UNAVAILABLE"
  | "NO_WALLET"
  | "NOT_FUNDED"
  | "BELOW_MINIMUM"
  | "UNDER_REVIEW"
  | "AWAITING_PUBLICATION"
  | "AWAITING_OPEN"
  | "ROUND_EXPIRED"
  | "ALREADY_CLAIMED";

export type TimelineStage = "EARNED" | "VERIFIED" | "FUNDED" | "QUEUED" | "PUBLISHED" | "CLAIM_OPEN" | "CLAIMED";

export interface RewardsSummary {
  totalPts: number;
  earnedToday: number | null;
  dailyCap: number | null;
  eligibleFundedUnallocated: number;
  pendingFunding: number;
  pendingReview: number;
  awaitingSettlement: number;
  claimableNow: number;
  claimedLifetime: number;
  noncountedHistorical: number;
  minimum: number;
  remainingToMinimum: number;
  percent: number;
  blocker: RewardBlocker;
  message: string;
  stage: TimelineStage;
  claimOpensAt: number | null;
  allocationEpoch: number | null;
  stale: boolean;
}

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");
const fmtDate = (s: number) =>
  new Date(s * 1000).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

export const TIMELINE: { stage: TimelineStage; label: string; explain: string }[] = [
  { stage: "EARNED", label: "Earned", explain: "Points recorded from qualifying activity." },
  { stage: "VERIFIED", label: "Verified", explain: "Activity confirmed on BOT Mainnet and reconciled." },
  { stage: "FUNDED", label: "Funded", explain: "Backed 1:1 by reserved FLOW in the reward budget." },
  { stage: "QUEUED", label: "Queued", explain: "1,000 FLOW minimum reached; included in the next settlement batch." },
  { stage: "PUBLISHED", label: "Published", explain: "Your allocation is published on-chain in a payout round." },
  { stage: "CLAIM_OPEN", label: "Claim open", explain: "The round's claim window is open — claim in your wallet." },
  { stage: "CLAIMED", label: "Claimed", explain: "FLOW has been sent to your wallet." },
];

export const BLOCKER_LABEL: Record<RewardBlocker, string> = {
  CLAIM_OPEN: "Claim open",
  STATE_UNAVAILABLE: "Status could not be verified",
  NO_WALLET: "No verified wallet bound",
  NOT_FUNDED: "Points awaiting reward funding",
  BELOW_MINIMUM: "Below the 1,000 FLOW minimum",
  UNDER_REVIEW: "Points under review",
  AWAITING_PUBLICATION: "Waiting for settlement publication",
  AWAITING_OPEN: "Waiting for claim window to open",
  ROUND_EXPIRED: "Claim window closed",
  ALREADY_CLAIMED: "Already claimed",
};

export interface SummaryInput {
  progression: RewardProgression | null | undefined;
  earnedToday?: number | null;
  dailyCap?: number | null;
  walletBound?: boolean;
  chainReadable?: boolean;
  nowSec: number;
}

function validAllocs(p: RewardProgression): ProgressionAllocation[] {
  return p.allocation ? [p.allocation] : [];
}

export function buildRewardsSummary(i: SummaryInput): RewardsSummary {
  const p = i.progression;
  const base = {
    earnedToday: i.earnedToday ?? null,
    dailyCap: i.dailyCap ?? null,
  };
  if (!p) {
    return {
      ...base, totalPts: 0, eligibleFundedUnallocated: 0, pendingFunding: 0, pendingReview: 0, awaitingSettlement: 0,
      claimableNow: 0, claimedLifetime: 0, noncountedHistorical: 0, minimum: 1000, remainingToMinimum: 1000, percent: 0,
      blocker: "STATE_UNAVAILABLE", stage: "EARNED", claimOpensAt: null, allocationEpoch: null, stale: true,
      message: "Reward status could not be verified. Try again; no claim amount is being assumed.",
    };
  }
  const a = validAllocs(p)[0] ?? null;
  const unclaimed = a && !a.claimed ? a : null;
  const open = !!unclaimed && i.nowSec >= unclaimed.claimStart && i.nowSec <= unclaimed.claimEnd;
  const claimableNow = open && p.claimButton && p.lifecycle === "CLAIMABLE_NOW" ? Math.floor(unclaimed!.amountFlow) : 0;
  const awaitingSettlement = unclaimed && !claimableNow && i.nowSec < unclaimed.claimStart ? Math.floor(unclaimed.amountFlow) : 0;
  const eligible = p.availableTowardMinimum;
  const stale = i.chainReadable === false;

  let blocker: RewardBlocker;
  let message: string;
  let stage: TimelineStage;
  if (claimableNow > 0) {
    blocker = "CLAIM_OPEN"; stage = "CLAIM_OPEN";
    message = `${fmt(claimableNow)} FLOW is ready. Claim with your connected wallet.`;
  } else if (stale) {
    blocker = "STATE_UNAVAILABLE"; stage = "EARNED";
    message = "Reward status could not be verified. Try again; no claim amount is being assumed.";
  } else if (awaitingSettlement > 0) {
    blocker = "AWAITING_OPEN"; stage = "PUBLISHED";
    message = `Reward published; claim opens at ${fmtDate(unclaimed!.claimStart)}.`;
  } else if (unclaimed && i.nowSec > unclaimed.claimEnd) {
    blocker = "ROUND_EXPIRED"; stage = "PUBLISHED";
    message = `The claim window for round #${unclaimed.epochId} closed on ${fmtDate(unclaimed.claimEnd)}.`;
  } else if (p.settlementReady) {
    blocker = "AWAITING_PUBLICATION"; stage = "QUEUED";
    message = "You qualify for the next payout batch. Automatic settlement is being prepared. No wallet action needed yet.";
  } else if (eligible >= p.minimum && i.walletBound === false) {
    blocker = "NO_WALLET"; stage = "FUNDED";
    message = "Bind a verified wallet so your eligible FLOW can be included in a settlement batch.";
  } else if (eligible >= p.minimum && p.reviewHeld > 0) {
    blocker = "UNDER_REVIEW"; stage = "FUNDED";
    message = `${fmt(p.reviewHeld)} Points are under review. Settlement waits until review completes.`;
  } else if (eligible > 0) {
    blocker = "BELOW_MINIMUM"; stage = "FUNDED";
    message = `You have ${fmt(eligible)} eligible FLOW toward the ${fmt(p.minimum)} FLOW minimum. Earn ${fmt(p.remainingToMinimum)} more to qualify for a settlement batch.`;
  } else if (p.pendingUnfunded > 0) {
    blocker = "NOT_FUNDED"; stage = "EARNED";
    message = `${fmt(p.pendingUnfunded)} Points are awaiting reward funding. These do not count toward claiming yet.`;
  } else if (a && a.claimed) {
    blocker = "ALREADY_CLAIMED"; stage = "CLAIMED";
    message = `Claim completed: ${fmt(a.amountFlow)} FLOW.`;
  } else {
    blocker = "BELOW_MINIMUM"; stage = p.earnedPoints > 0 ? "EARNED" : "EARNED";
    message = `You have 0 eligible FLOW toward the ${fmt(p.minimum)} FLOW minimum. Earn ${fmt(p.remainingToMinimum)} more to qualify for a settlement batch.`;
  }

  return {
    ...base,
    totalPts: p.earnedPoints,
    eligibleFundedUnallocated: eligible,
    pendingFunding: p.pendingUnfunded,
    pendingReview: p.reviewHeld,
    awaitingSettlement,
    claimableNow,
    claimedLifetime: p.claimedFlow,
    noncountedHistorical: p.historicalNonclaimable,
    minimum: p.minimum,
    remainingToMinimum: p.remainingToMinimum,
    percent: p.percent,
    blocker, message, stage,
    claimOpensAt: unclaimed ? unclaimed.claimStart : null,
    allocationEpoch: unclaimed?.epochId ?? a?.epochId ?? null,
    stale,
  };
}
