/**
 * FlowBridge V12 — canonical FLOW rewards execution registry.
 *
 * Fail-closed by construction:
 *  - Unsupported chains resolve to no config at all.
 *  - Mainnet (BOT 677) never falls back to testnet addresses; its addresses stay
 *    null until an explicit promotion gate fills them.
 *  - Claims are only ever "ready" when the chain config carries BOTH a token and
 *    a distributor address AND an approved Points→FLOW conversion policy exists.
 *
 * Nothing in this module invents tokenomics. Addresses are filled in only by a
 * later deployment gate, from source-controlled deployment config.
 */

export type Hex = `0x${string}`;

export interface FlowRewardsChainConfig {
  chainId: number;
  label: string;
  isMainnet: boolean;
  /** V12 source readiness (contracts built + audited source in repo). */
  v12Built: boolean;
  /** Filled only after the deployment gate for this exact chain. */
  token: Hex | null;
  distributor: Hex | null;
  /** Operator switch; still requires deployed addresses + policy to matter. */
  claimsEnabled: boolean;
}

export const BOT_TESTNET_CHAIN_ID = 968;
export const BOT_MAINNET_CHAIN_ID = 677;

export const FLOW_REWARDS_CHAINS: readonly FlowRewardsChainConfig[] = [
  {
    chainId: BOT_TESTNET_CHAIN_ID,
    label: "BOT Testnet",
    isMainnet: false,
    v12Built: true,
    // V12.2B verified live deployment (contracts/deployments/bot-testnet.json).
    token: "0xCE14Ca1CF2012F1996D5FBc7d369FA051aa641Ac",
    distributor: "0x559605fa3120cd472b86966FE4b5dC7e9e0b2b34",
    // V12.2C: distributor funded and verified on-chain with exactly 10,000,000 FLOW
    // from the approved treasury (tx 0xf88dabce…284e09). Claim authorization is READY.
    claimsEnabled: true,
  },
  {
    chainId: BOT_MAINNET_CHAIN_ID,
    label: "BOT Mainnet",
    isMainnet: true,
    v12Built: true,
    // V30.2B P1: canonical verified + funded mainnet addresses only. Selection
    // is FUNDED_READY, never FEATURE_ACTIVE — claims stay disabled below, so no
    // claim transaction can be prepared on mainnet.
    token: resolveCanonicalAddress(BOT_MAINNET_CHAIN_ID, "FlowToken"),
    distributor: resolveCanonicalAddress(
      BOT_MAINNET_CHAIN_ID,
      "FlowRewardsMerkleDistributor",
    ),
    claimsEnabled: V30_2B_FEATURE_ACTIVATION.rewardClaimsEnabled,
  },
] as const;

export function getFlowRewardsChainConfig(chainId: number | null | undefined): FlowRewardsChainConfig | null {
  if (typeof chainId !== "number" || !Number.isInteger(chainId)) return null;
  return FLOW_REWARDS_CHAINS.find((c) => c.chainId === chainId) ?? null;
}

export type FlowClaimBlockedReason =
  | "unsupportedChain"
  | "distributorNotDeployed"
  | "mainnetPromotionPending"
  | "claimsDisabled"
  | "conversionPolicyNotApproved";

export type FlowClaimReadiness =
  | { ready: false; reason: FlowClaimBlockedReason; config: FlowRewardsChainConfig | null }
  | { ready: true; config: FlowRewardsChainConfig & { token: Hex; distributor: Hex } };

/** Human copy for the /earn surface. Never implies a claim is possible. */
export const FLOW_CLAIM_BLOCKED_COPY: Record<FlowClaimBlockedReason, string> = {
  unsupportedChain: "FLOW rewards are not configured for this network.",
  distributorNotDeployed: "Testnet distributor not deployed — claim contract pending.",
  mainnetPromotionPending: "Mainnet claim contract pending promotion.",
  claimsDisabled: "On-chain FLOW claims are currently disabled.",
  conversionPolicyNotApproved: "FLOW token claims are pending an approved rewards policy.",
};

export function resolveFlowClaimReadiness(
  chainId: number | null | undefined,
  conversionPolicyApproved: boolean,
): FlowClaimReadiness {
  const config = getFlowRewardsChainConfig(chainId);
  if (!config) return { ready: false, reason: "unsupportedChain", config: null };

  if (!config.token || !config.distributor) {
    return {
      ready: false,
      reason: config.isMainnet ? "mainnetPromotionPending" : "distributorNotDeployed",
      config,
    };
  }
  if (!config.claimsEnabled) return { ready: false, reason: "claimsDisabled", config };
  if (!conversionPolicyApproved) return { ready: false, reason: "conversionPolicyNotApproved", config };

  return { ready: true, config: config as FlowRewardsChainConfig & { token: Hex; distributor: Hex } };
}
