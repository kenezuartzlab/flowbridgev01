/**
 * V36.1 — single source of truth for which product functions exist in which
 * environment. UI uses isFeatureAllowed to hide tools; transaction senders and
 * server endpoints call assertFeatureAllowed so the rule holds beyond the UI.
 * Cross-chain bridge legs (BNB/Ethereum) are mainnet-class by design.
 */
export type Environment = "mainnet" | "testnet";

export type ProductFeature =
  | "TESTNET_STAKING_LIFECYCLE"
  | "MAINNET_STAKING"
  | "REWARD_CONVERSION"
  | "FLOW_TOKEN_CLAIM"
  | "BRIDGE";

const MAINNET_CHAINS = new Set([677, 56, 1]);
const TESTNET_CHAINS = new Set([968, 97]);

export function environmentOf(chainId: number | null | undefined): Environment | null {
  if (chainId == null) return null;
  if (MAINNET_CHAINS.has(chainId)) return "mainnet";
  if (TESTNET_CHAINS.has(chainId)) return "testnet";
  return null;
}

const MATRIX: Record<ProductFeature, { envs: Environment[]; chains?: number[] }> = {
  TESTNET_STAKING_LIFECYCLE: { envs: ["testnet"], chains: [968] },
  MAINNET_STAKING: { envs: ["mainnet"], chains: [677] },
  REWARD_CONVERSION: { envs: ["mainnet", "testnet"], chains: [677, 968] },
  FLOW_TOKEN_CLAIM: { envs: ["mainnet", "testnet"], chains: [677, 968] },
  BRIDGE: { envs: ["mainnet", "testnet"] },
};

export function isFeatureAllowed(feature: ProductFeature, chainId: number | null | undefined): boolean {
  const env = environmentOf(chainId);
  if (!env) return false;
  const rule = MATRIX[feature];
  if (!rule.envs.includes(env)) return false;
  return rule.chains ? rule.chains.includes(chainId as number) : true;
}

export class EnvironmentRestrictionError extends Error {
  code = "ENVIRONMENT_NOT_SUPPORTED" as const;
}

export function assertFeatureAllowed(feature: ProductFeature, chainId: number | null | undefined): void {
  if (!isFeatureAllowed(feature, chainId)) {
    throw new EnvironmentRestrictionError(
      `This action is not available on ${chainId == null ? "an unknown network" : `chain ${chainId}`}.`,
    );
  }
}
