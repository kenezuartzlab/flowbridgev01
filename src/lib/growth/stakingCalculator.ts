/**
 * FlowBridge V27 §7 — the staking estimate calculator (pure).
 *
 * amount + published rate + time = estimated reward. Every result is a PREVIEW:
 * it is derived from live on-chain schedule inputs supplied by the caller and it
 * is never presented as income. When any required input is unreadable the result
 * is `null` — never zero, never a guess.
 *
 * No signature, no ActionIntent, no mission: this module computes numbers only.
 */

export const STAKING_CALCULATOR_SCHEMA_VERSION = "flowbridge.stakingcalc/1" as const;
export const STAKING_CALCULATOR_POLICY_VERSION = "V27" as const;

export interface StakingCalculatorInput {
  /** FLOW the user is considering staking (whole-token units). */
  amountFlow: number;
  /** Days the estimate covers. */
  days: number;
  /** Live vault reward rate in FLOW per second. `null` = unreadable. */
  rewardFlowPerSecond: number | null;
  /** Live total already staked in the vault, FLOW. `null` = unreadable. */
  totalStakedFlow: number | null;
  /** Published minimum first stake, FLOW. `null` = unreadable. */
  minStakeFlow?: number | null;
  /** Seconds left on the funded schedule. `null` = unknown. */
  scheduleSecondsRemaining?: number | null;
  /** Reward FLOW still held as inventory by the vault. `null` = unknown. */
  rewardInventoryFlow?: number | null;
}

export type StakingCalculatorBlocker =
  | "AMOUNT_REQUIRED"
  | "BELOW_MINIMUM"
  | "RATE_UNAVAILABLE"
  | "SCHEDULE_INACTIVE";

export interface StakingCalculatorResult {
  schemaVersion: typeof STAKING_CALCULATOR_SCHEMA_VERSION;
  policyVersion: typeof STAKING_CALCULATOR_POLICY_VERSION;
  /** Always PREVIEW. There is no verified-estimate mode. */
  label: "PREVIEW";
  amountFlow: number;
  days: number;
  /** Days actually used after clamping to the funded schedule. */
  effectiveDays: number;
  /** Your share of the vault after staking, 0..1. `null` when unreadable. */
  shareOfVault: number | null;
  /** Estimated reward in FLOW over `effectiveDays`. `null` when unreadable. */
  estimatedRewardFlow: number | null;
  /** Plain-English formula sentence (V27 §7). */
  formula: string;
  assumptions: readonly string[];
  limits: readonly string[];
  blockers: readonly StakingCalculatorBlocker[];
  /** Constants: an estimate is never income and never authorizes anything. */
  guaranteed: false;
  createsActionIntent: false;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function fmt(n: number, frac = 4): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: frac });
}

export function computeStakingEstimate(
  input: StakingCalculatorInput,
): StakingCalculatorResult {
  const amountFlow = Math.max(0, num(input.amountFlow));
  const days = Math.max(0, num(input.days));
  const blockers: StakingCalculatorBlocker[] = [];

  const rate = input.rewardFlowPerSecond;
  const total = input.totalStakedFlow;
  const rateReadable = typeof rate === "number" && Number.isFinite(rate) && rate > 0;
  const totalReadable = typeof total === "number" && Number.isFinite(total) && total >= 0;

  if (amountFlow <= 0) blockers.push("AMOUNT_REQUIRED");
  if (!rateReadable || !totalReadable) blockers.push("RATE_UNAVAILABLE");
  if (
    typeof input.minStakeFlow === "number" &&
    input.minStakeFlow > 0 &&
    amountFlow > 0 &&
    amountFlow < input.minStakeFlow
  ) {
    blockers.push("BELOW_MINIMUM");
  }

  const remainingDays =
    typeof input.scheduleSecondsRemaining === "number" &&
    Number.isFinite(input.scheduleSecondsRemaining)
      ? Math.max(0, input.scheduleSecondsRemaining) / 86400
      : null;
  if (remainingDays !== null && remainingDays <= 0) blockers.push("SCHEDULE_INACTIVE");

  const effectiveDays = remainingDays === null ? days : Math.min(days, remainingDays);

  let shareOfVault: number | null = null;
  let estimatedRewardFlow: number | null = null;

  if (rateReadable && totalReadable && amountFlow > 0 && effectiveDays > 0) {
    const denom = total! + amountFlow;
    shareOfVault = denom > 0 ? amountFlow / denom : null;
    if (shareOfVault !== null) {
      const gross = rate! * 86400 * effectiveDays * shareOfVault;
      const capped =
        typeof input.rewardInventoryFlow === "number" &&
        Number.isFinite(input.rewardInventoryFlow) &&
        input.rewardInventoryFlow >= 0
          ? Math.min(gross, input.rewardInventoryFlow)
          : gross;
      estimatedRewardFlow = Number.isFinite(capped) ? capped : null;
    }
  }

  const formula =
    estimatedRewardFlow === null
      ? "An estimate needs an amount plus a readable published reward rate and total staked. One of those is missing right now, so no number is shown."
      : `${fmt(amountFlow, 2)} FLOW is ${(shareOfVault! * 100).toFixed(2)}% of the vault after you stake. The published schedule pays about ${fmt(rate! * 86400, 4)} FLOW per day in total, so over ${fmt(effectiveDays, 2)} days your estimated reward is ${fmt(estimatedRewardFlow, 4)} FLOW before any rule changes or limits.`;

  const assumptions = [
    "Your stake stays in the vault for the whole period.",
    "The total staked stays the same as it is right now.",
    "The published reward schedule keeps running at its current rate.",
    "Rewards are shared: more total staked means a smaller share for everyone.",
  ];

  const limits = [
    "Estimate only — this is not income and not a guarantee.",
    "Rate and total staked are read live from the vault and change constantly.",
    "The operator can pause staking and reward claims; withdrawing principal stays open.",
    "Claiming a staking reward is a separate action you confirm in your wallet.",
  ];
  if (remainingDays !== null && days > remainingDays) {
    limits.push(
      `The funded schedule has about ${fmt(remainingDays, 2)} days left, so the estimate only covers that period.`,
    );
  }
  if (blockers.includes("BELOW_MINIMUM")) {
    limits.push(
      `The published minimum first stake is ${fmt(num(input.minStakeFlow), 4)} FLOW.`,
    );
  }

  return {
    schemaVersion: STAKING_CALCULATOR_SCHEMA_VERSION,
    policyVersion: STAKING_CALCULATOR_POLICY_VERSION,
    label: "PREVIEW",
    amountFlow,
    days,
    effectiveDays,
    shareOfVault,
    estimatedRewardFlow,
    formula,
    assumptions,
    limits,
    blockers,
    guaranteed: false,
    createsActionIntent: false,
  };
}
