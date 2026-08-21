/**
 * FlowBridge V13 — FLOW staking owner-gated parameter policy.
 *
 * Fail-closed by construction. No staking economic value is invented here:
 * every parameter is UNAPPROVED until an owner-reviewed value lands in
 * contracts/config/staking-bot-testnet.json. Nothing in this module can be
 * used to display a yield.
 */

export type Hex = `0x${string}`;

export const STAKING_POLICY_VERSION = "v13-testnet-build-gate";

/** Frozen V12 addresses — staking must reuse the existing FLOW token. */
export const FLOW_TOKEN_BOT_TESTNET: Hex = "0xCE14Ca1CF2012F1996D5FBc7d369FA051aa641Ac";
export const FLOW_DISTRIBUTOR_BOT_TESTNET: Hex = "0x559605fa3120cd472b86966FE4b5dC7e9e0b2b34";

export type StakingParameterStatus = "APPROVED" | "UNAPPROVED" | "DISABLED";

export interface StakingParameterVerdict {
  parameter: string;
  status: StakingParameterStatus;
  value: string | null;
  note: string;
}

export interface FlowStakingConfig {
  chainId?: number | null;
  network?: string | null;
  token?: string | null;
  vaultOwner?: string | null;
  economics?: {
    minStake?: string | number | null;
    rewardBudgetPerEpoch?: string | number | null;
    epochDurationSeconds?: number | null;
    startTime?: string | number | null;
    lockSeconds?: number | null;
    earlyWithdrawPenaltyBps?: number | null;
    maxStakePerWallet?: string | number | null;
  } | null;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function amount(v: unknown): string | null {
  if (typeof v === "number" && Number.isSafeInteger(v) && v > 0) return String(v);
  if (typeof v === "string" && /^[0-9]+$/.test(v) && BigInt(v) > 0n) return v;
  return null;
}

export interface FlowStakingPolicyReport {
  configPath: string;
  chainId: number | null;
  verdicts: StakingParameterVerdict[];
  unapproved: string[];
  /** Deployment is only preparable when token + owner are approved. */
  deployReady: boolean;
  /** Reward emission requires budget + duration + start time approvals. */
  economicsApproved: boolean;
}

export function buildFlowStakingPolicyReport(
  config: FlowStakingConfig,
  configPath: string,
): FlowStakingPolicyReport {
  const e = config.economics ?? {};
  const verdicts: StakingParameterVerdict[] = [];
  const push = (
    parameter: string,
    status: StakingParameterStatus,
    value: string | null,
    note: string,
  ) => verdicts.push({ parameter, status, value, note });

  const tokenOk =
    typeof config.token === "string" &&
    ADDRESS_RE.test(config.token) &&
    config.token.toLowerCase() === FLOW_TOKEN_BOT_TESTNET.toLowerCase();
  push(
    "token",
    tokenOk ? "APPROVED" : "UNAPPROVED",
    tokenOk ? FLOW_TOKEN_BOT_TESTNET : null,
    tokenOk
      ? "Existing fixed-supply FLOW token (V12.2 deployment, frozen)."
      : "Staking principal must be the existing FLOW token on BOT Testnet 968.",
  );

  const ownerOk = typeof config.vaultOwner === "string" && ADDRESS_RE.test(config.vaultOwner);
  push(
    "vaultOwner",
    ownerOk ? "APPROVED" : "UNAPPROVED",
    ownerOk ? config.vaultOwner! : null,
    ownerOk ? configPath : "No owner-approved vault owner address.",
  );

  const min = amount(e.minStake);
  push(
    "economics.minStake",
    min ? "APPROVED" : "UNAPPROVED",
    min,
    min ? configPath : "OWNER APPROVAL REQUIRED — minimum stake is never inferred.",
  );

  const budget = amount(e.rewardBudgetPerEpoch);
  push(
    "economics.rewardBudgetPerEpoch",
    budget ? "APPROVED" : "UNAPPROVED",
    budget,
    budget ? configPath : "OWNER APPROVAL REQUIRED — no reward budget may be invented.",
  );

  const duration =
    typeof e.epochDurationSeconds === "number" && Number.isInteger(e.epochDurationSeconds) && e.epochDurationSeconds > 0
      ? String(e.epochDurationSeconds)
      : null;
  push(
    "economics.epochDurationSeconds",
    duration ? "APPROVED" : "UNAPPROVED",
    duration,
    duration ? configPath : "OWNER APPROVAL REQUIRED — epoch/reward duration.",
  );

  const start = amount(e.startTime);
  push(
    "economics.startTime",
    start ? "APPROVED" : "UNAPPROVED",
    start,
    start ? configPath : "OWNER APPROVAL REQUIRED at deployment/activation.",
  );

  const lock =
    typeof e.lockSeconds === "number" && Number.isInteger(e.lockSeconds) && e.lockSeconds > 0
      ? String(e.lockSeconds)
      : null;
  push(
    "economics.lockSeconds",
    lock ? "APPROVED" : "DISABLED",
    lock,
    lock ? configPath : "NONE unless explicitly approved — vault ships without lock/cooldown.",
  );

  const penalty =
    typeof e.earlyWithdrawPenaltyBps === "number" && e.earlyWithdrawPenaltyBps > 0
      ? String(e.earlyWithdrawPenaltyBps)
      : null;
  push(
    "economics.earlyWithdrawPenaltyBps",
    penalty ? "APPROVED" : "DISABLED",
    penalty,
    penalty ? configPath : "NONE unless explicitly approved — no slashing in V13.",
  );

  const maxStake = amount(e.maxStakePerWallet);
  push(
    "economics.maxStakePerWallet",
    maxStake ? "APPROVED" : "DISABLED",
    maxStake,
    maxStake ? configPath : "Optional; unlimited until owner-approved.",
  );

  const unapproved = verdicts.filter((v) => v.status === "UNAPPROVED").map((v) => v.parameter);
  return {
    configPath,
    chainId: typeof config.chainId === "number" ? config.chainId : null,
    verdicts,
    unapproved,
    deployReady: tokenOk && ownerOk,
    economicsApproved: Boolean(budget && duration && start),
  };
}
