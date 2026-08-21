/**
 * FlowBridge V13 — FLOW staking execution registry.
 *
 * Fail-closed: no vault is deployed in V13, so staking can never resolve as
 * live. Mainnet stays unconfigured. Addresses are only filled by a future
 * deployment gate from a source-controlled manifest.
 */
import {
  FLOW_TOKEN_BOT_TESTNET,
  STAKING_POLICY_VERSION,
  type Hex,
} from "./flowStakingPolicy";

export const BOT_TESTNET_CHAIN_ID = 968;
export const BOT_MAINNET_CHAIN_ID = 677;

export interface FlowStakingChainConfig {
  chainId: number;
  label: string;
  isMainnet: boolean;
  /** Existing FLOW token used as staking principal. */
  token: Hex | null;
  /** Filled only after a reviewed FlowStakingVault deployment. */
  vault: Hex | null;
  /** Operator switch; irrelevant until a vault + funded schedule exist. */
  stakingEnabled: boolean;
  policyVersion: string;
}

export const FLOW_STAKING_CHAINS: readonly FlowStakingChainConfig[] = [
  {
    chainId: BOT_TESTNET_CHAIN_ID,
    label: "BOT Testnet",
    isMainnet: false,
    token: FLOW_TOKEN_BOT_TESTNET,
    // V13 is a BUILD gate: nothing was deployed or broadcast.
    vault: null,
    stakingEnabled: false,
    policyVersion: STAKING_POLICY_VERSION,
  },
  {
    chainId: BOT_MAINNET_CHAIN_ID,
    label: "BOT Mainnet",
    isMainnet: true,
    token: null,
    vault: null,
    stakingEnabled: false,
    policyVersion: STAKING_POLICY_VERSION,
  },
] as const;

export function getFlowStakingChainConfig(
  chainId: number | null | undefined,
): FlowStakingChainConfig | null {
  if (typeof chainId !== "number" || !Number.isInteger(chainId)) return null;
  return FLOW_STAKING_CHAINS.find((c) => c.chainId === chainId) ?? null;
}

export type FlowStakingBlockedReason =
  | "unsupportedChain"
  | "vaultNotDeployed"
  | "mainnetPromotionPending"
  | "stakingDisabled"
  | "scheduleNotFunded";

export const FLOW_STAKING_BLOCKED_COPY: Record<FlowStakingBlockedReason, string> = {
  unsupportedChain: "FLOW staking is not configured for this network.",
  vaultNotDeployed: "Testnet preview — staking vault not deployed yet.",
  mainnetPromotionPending: "Mainnet staking is pending promotion.",
  stakingDisabled: "FLOW staking is currently disabled by the operator.",
  scheduleNotFunded: "No funded reward schedule — rewards are not accruing.",
};

export type FlowStakingReadiness =
  | { ready: false; reason: FlowStakingBlockedReason; config: FlowStakingChainConfig | null }
  | { ready: true; config: FlowStakingChainConfig & { token: Hex; vault: Hex } };

export function resolveFlowStakingReadiness(
  chainId: number | null | undefined,
  scheduleFunded: boolean,
): FlowStakingReadiness {
  const config = getFlowStakingChainConfig(chainId);
  if (!config) return { ready: false, reason: "unsupportedChain", config: null };
  if (!config.token || !config.vault) {
    return {
      ready: false,
      reason: config.isMainnet ? "mainnetPromotionPending" : "vaultNotDeployed",
      config,
    };
  }
  if (!config.stakingEnabled) return { ready: false, reason: "stakingDisabled", config };
  if (!scheduleFunded) return { ready: false, reason: "scheduleNotFunded", config };
  return { ready: true, config: config as FlowStakingChainConfig & { token: Hex; vault: Hex } };
}

/**
 * Reward-schedule rate description from authoritative on-chain state only.
 * Returns null whenever any input is missing — callers must then render
 * "no active schedule" instead of any APR/APY figure.
 */
export function describeRewardSchedule(state: {
  rewardRatePerSecond: bigint | null;
  periodFinish: bigint | null;
  totalStaked: bigint | null;
  nowSeconds: bigint;
}): { active: boolean; remainingSeconds: bigint; ratePerDay: bigint } | null {
  const { rewardRatePerSecond, periodFinish, nowSeconds } = state;
  if (rewardRatePerSecond == null || periodFinish == null) return null;
  if (rewardRatePerSecond <= 0n || periodFinish <= nowSeconds) {
    return { active: false, remainingSeconds: 0n, ratePerDay: 0n };
  }
  return {
    active: true,
    remainingSeconds: periodFinish - nowSeconds,
    ratePerDay: rewardRatePerSecond * 86400n,
  };
}
