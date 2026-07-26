export const FLOW_REWARD_MIN_USD = 5;
export const FLOW_REWARD_USD_BLOCK = 5;
export const FLOW_REWARD_POINTS_PER_BLOCK = 1;

export function isRewardEligibleUsd(value: number | null | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= FLOW_REWARD_MIN_USD;
}

export function estimateFlowPointsForUsd(value: number | null | undefined): number {
  if (!isRewardEligibleUsd(value)) return 0;
  return Math.floor(Number(value) / FLOW_REWARD_USD_BLOCK) * FLOW_REWARD_POINTS_PER_BLOCK;
}