export const FLOW_REWARD_MIN_USD = 5;
export const FLOW_REWARD_USD_BLOCK = 1;
export const FLOW_REWARD_POINTS_PER_BLOCK = 1;

export interface RewardRules {
  minUsd: number;
  usdBlock: number;
  pointsPerBlock: number;
}

export const DEFAULT_REWARD_RULES: RewardRules = {
  minUsd: FLOW_REWARD_MIN_USD,
  usdBlock: FLOW_REWARD_USD_BLOCK,
  pointsPerBlock: FLOW_REWARD_POINTS_PER_BLOCK,
};

export function isRewardEligibleUsd(
  value: number | null | undefined,
  rules: RewardRules = DEFAULT_REWARD_RULES,
): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= rules.minUsd;
}

export function estimateFlowPointsForUsd(
  value: number | null | undefined,
  rules: RewardRules = DEFAULT_REWARD_RULES,
): number {
  if (!isRewardEligibleUsd(value, rules)) return 0;
  const block = rules.usdBlock > 0 ? rules.usdBlock : FLOW_REWARD_USD_BLOCK;
  return Math.floor(Number(value) / block) * rules.pointsPerBlock;
}

/**
 * V12.4 — the executed referrer share of a referee's verified swap points.
 * Extracted verbatim from createTransactionHistory(); economics unchanged.
 */
export function referralActivityShare(
  refereePoints: number,
  referralActivityPct: number | null | undefined,
): number {
  const pts = Math.max(0, Math.floor(Number(refereePoints) || 0));
  const pct = Math.max(0, Number(referralActivityPct) || 0);
  return Math.floor((pts * pct) / 100);
}
