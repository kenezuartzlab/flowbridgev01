/**
 * V15 §6 — every important number is computed HERE from structured inputs.
 *
 * The language model is never allowed to produce balances, points, caps, claim
 * amounts or staking rates freehand. The server computes these values and the
 * model only narrates the already-computed strings.
 */
import {
  DEFAULT_FLOW_POINTS_V2_POLICY,
  coreSwapBasePoints,
  type FlowPointsV2Policy,
} from "@/lib/rewards/flowPointsV2";

export interface SwapPointsExplanation {
  qualified: boolean;
  points: number;
  volumeUsd: number;
  reason: string;
  capRemaining: number;
  cappedTo: number;
}

/** Why a swap earned (or did not earn) exactly N FLOW Points. */
export function explainSwapPoints(input: {
  volumeUsd: number;
  pointsAlreadyToday: number;
  policy?: FlowPointsV2Policy;
}): SwapPointsExplanation {
  const policy = input.policy ?? DEFAULT_FLOW_POINTS_V2_POLICY;
  const volumeUsd = Number.isFinite(input.volumeUsd) ? Math.max(0, input.volumeUsd) : 0;
  const base = coreSwapBasePoints(volumeUsd, policy);
  const capRemaining = Math.max(0, policy.dailyCoreSwapCap - Math.max(0, input.pointsAlreadyToday));
  const points = Math.min(base, capRemaining);

  let reason: string;
  if (base === 0) {
    reason = `Swaps under $${policy.minSwapUsd} don't earn FLOW Points, and this one was $${formatUsdAmount(volumeUsd)}.`;
  } else if (points < base) {
    reason = `This swap qualified for ${base} points but the ${policy.dailyCoreSwapCap}-point daily cap left room for ${capRemaining}.`;
  } else {
    reason = `$${formatUsdAmount(volumeUsd)} of volume earns ${points} points at 1 point per whole $1 (minimum $${policy.minSwapUsd}).`;
  }

  return { qualified: points > 0, points, volumeUsd, reason, capRemaining, cappedTo: base - points };
}

export interface ClaimMath {
  cumulativePoints: number;
  alreadyClaimedFlow: number;
  claimableFlow: number;
  conversionNote: string;
}

/** 1 FLOW Point = 1 FLOW, cumulative; Campaign PTS excluded. */
export function computeClaimable(input: {
  cumulativeFlowPoints: number;
  claimedFlow: number;
}): ClaimMath {
  const cumulative = Math.max(0, Math.floor(input.cumulativeFlowPoints));
  const claimed = Math.max(0, Math.floor(input.claimedFlow));
  return {
    cumulativePoints: cumulative,
    alreadyClaimedFlow: claimed,
    claimableFlow: Math.max(0, cumulative - claimed),
    conversionNote:
      "1 FLOW Point converts to 1 FLOW cumulatively. Campaign PTS are excluded from this conversion.",
  };
}

export interface StakingEstimate {
  principalFlow: number;
  earnedFlow: number;
  /** Share of the epoch budget implied by current total staked. */
  epochRatePercent: number | null;
  annualizedEstimatePercent: number | null;
  note: string;
}

/**
 * Rate is derived from live vault state only, and always labelled an estimate —
 * never a guaranteed APY.
 */
export function estimateStakingRate(input: {
  principalFlow: number;
  earnedFlow: number;
  totalStakedFlow: number;
  rewardBudgetPerEpochFlow: number;
  epochDurationSeconds: number;
}): StakingEstimate {
  const principal = safeNumber(input.principalFlow);
  const earned = safeNumber(input.earnedFlow);
  const total = safeNumber(input.totalStakedFlow);
  if (total <= 0 || input.epochDurationSeconds <= 0) {
    return {
      principalFlow: principal,
      earnedFlow: earned,
      epochRatePercent: null,
      annualizedEstimatePercent: null,
      note: "No live vault totals available, so no rate estimate can be computed.",
    };
  }
  const epochRate = (safeNumber(input.rewardBudgetPerEpochFlow) / total) * 100;
  const epochsPerYear = (365 * 24 * 60 * 60) / input.epochDurationSeconds;
  return {
    principalFlow: principal,
    earnedFlow: earned,
    epochRatePercent: round(epochRate, 4),
    annualizedEstimatePercent: round(epochRate * epochsPerYear, 4),
    note: "Estimate derived from current vault totals and the approved epoch budget. It moves as other stakers join or leave — it is not a guaranteed APY.",
  };
}

export function formatUsdAmount(value: number): string {
  return (Math.round(safeNumber(value) * 100) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function safeNumber(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

function round(v: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}
