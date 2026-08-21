/**
 * FlowBridge V13.1 — FLOW staking owner parameter LOCK.
 *
 * Extends the V13 policy report with the remaining V13.1 decisions
 * (reward-funding treasury, cooldown, emergency-withdraw policy) and decides
 * whether a production-shaped local dry-run may run at all.
 *
 * Fail-closed: any missing mandatory decision => PARAMETER LOCK BLOCKED.
 * Nothing here derives, stores or displays an APR/APY.
 */
import {
  buildFlowStakingPolicyReport,
  type FlowStakingConfig,
  type StakingParameterStatus,
  type StakingParameterVerdict,
} from "./flowStakingPolicy";

export const STAKING_LOCK_VERSION = "v13.1-parameter-lock";

/** The only accepted emergency policy: pause can never trap principal. */
export const APPROVED_EMERGENCY_POLICY = "principal-withdraw-always-available";

/** Accepted explicit start policy when no absolute timestamp is approved. */
export const IMMEDIATE_START_POLICY = "immediate-on-activation";

export interface FlowStakingLockConfig extends FlowStakingConfig {
  rewardTreasury?: string | null;
  safety?: {
    cooldownSeconds?: number | null;
    emergencyWithdrawPolicy?: string | null;
  } | null;
}

/** Parameters that MUST be explicitly approved before any deployment shape. */
export const MANDATORY_PARAMETERS = [
  "token",
  "vaultOwner",
  "rewardTreasury",
  "economics.minStake",
  "economics.rewardBudgetPerEpoch",
  "economics.epochDurationSeconds",
  "economics.startTime",
  "safety.emergencyWithdrawPolicy",
] as const;

export interface FlowStakingLockReport {
  version: string;
  configPath: string;
  verdicts: StakingParameterVerdict[];
  blocked: string[];
  /** Mandatory decisions all APPROVED. */
  parameterLockPass: boolean;
  /** budget <= funded inventory proof inputs (null when unapproved). */
  solvency: {
    budget: string | null;
    durationSeconds: string | null;
    ratePerSecond: string | null;
    requiredInventory: string | null;
  };
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function amount(v: unknown): bigint | null {
  if (typeof v === "number" && Number.isSafeInteger(v) && v > 0) return BigInt(v);
  if (typeof v === "string" && /^[0-9]+$/.test(v) && BigInt(v) > 0n) return BigInt(v);
  return null;
}

export function buildFlowStakingLockReport(
  config: FlowStakingLockConfig,
  configPath: string,
): FlowStakingLockReport {
  const base = buildFlowStakingPolicyReport(config, configPath);
  const verdicts: StakingParameterVerdict[] = [...base.verdicts];
  const push = (
    parameter: string,
    status: StakingParameterStatus,
    value: string | null,
    note: string,
  ) => verdicts.push({ parameter, status, value, note });

  // Reward-funding treasury — must be explicit, never assumed to be deployer.
  const treasuryOk = typeof config.rewardTreasury === "string" && ADDRESS_RE.test(config.rewardTreasury);
  push(
    "rewardTreasury",
    treasuryOk ? "APPROVED" : "UNAPPROVED",
    treasuryOk ? config.rewardTreasury! : null,
    treasuryOk ? configPath : "OWNER APPROVAL REQUIRED — wallet supplying FLOW reward inventory.",
  );

  // Cooldown — explicit NONE by default (no guessed withdrawal delay).
  const cooldown =
    typeof config.safety?.cooldownSeconds === "number" && config.safety.cooldownSeconds > 0
      ? String(config.safety.cooldownSeconds)
      : null;
  push(
    "safety.cooldownSeconds",
    cooldown ? "APPROVED" : "DISABLED",
    cooldown,
    cooldown ? configPath : "NONE — vault ships without a withdrawal cooldown.",
  );

  // Emergency-withdraw policy — the highest-priority safety decision.
  const emergency = config.safety?.emergencyWithdrawPolicy ?? null;
  const emergencyOk = emergency === APPROVED_EMERGENCY_POLICY;
  push(
    "safety.emergencyWithdrawPolicy",
    emergencyOk ? "APPROVED" : "UNAPPROVED",
    emergencyOk ? APPROVED_EMERGENCY_POLICY : (typeof emergency === "string" ? emergency : null),
    emergencyOk
      ? "withdraw() is not pausable in contracts/FlowStakingVault.sol — pause blocks new stakes and reward claims only; principal is never trapped or seizable."
      : `OWNER APPROVAL REQUIRED — must be exactly "${APPROVED_EMERGENCY_POLICY}"; no other escape model is accepted.`,
  );

  // Start policy: absolute owner-approved timestamp OR explicit immediate policy.
  const rawStart = config.economics?.startTime ?? null;
  if (rawStart === IMMEDIATE_START_POLICY) {
    const idx = verdicts.findIndex((v) => v.parameter === "economics.startTime");
    const entry: StakingParameterVerdict = {
      parameter: "economics.startTime",
      status: "APPROVED",
      value: IMMEDIATE_START_POLICY,
      note: `${configPath} — schedule starts only when the owner calls activateSchedule() on a fully funded vault.`,
    };
    if (idx >= 0) verdicts[idx] = entry;
    else verdicts.push(entry);
  }

  const byName = new Map(verdicts.map((v) => [v.parameter, v]));
  const blocked = MANDATORY_PARAMETERS.filter((p) => byName.get(p)?.status !== "APPROVED").map(String);

  const budget = amount(config.economics?.rewardBudgetPerEpoch);
  const duration =
    typeof config.economics?.epochDurationSeconds === "number" && config.economics.epochDurationSeconds > 0
      ? BigInt(config.economics.epochDurationSeconds)
      : null;
  const rate = budget && duration ? budget / duration : null;

  return {
    version: STAKING_LOCK_VERSION,
    configPath,
    verdicts,
    blocked,
    parameterLockPass: blocked.length === 0,
    solvency: {
      budget: budget ? budget.toString() : null,
      durationSeconds: duration ? duration.toString() : null,
      ratePerSecond: rate != null ? rate.toString() : null,
      // Maximum emission of one schedule = rate * duration (<= budget by floor div).
      requiredInventory: rate != null && duration ? (rate * duration).toString() : null,
    },
  };
}
