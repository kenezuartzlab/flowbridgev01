/**
 * FlowBridge V30.1A — CANONICAL BOT NETWORK IDENTITY.
 *
 * Single source of truth for BOT network identifiers across the application,
 * campaign configuration, activity/explorer mapping, AI routing, bridge
 * configuration and deployment tooling.
 *
 *   BOT Mainnet EVM chain id = 677
 *   BOT Testnet EVM chain id = 968
 *
 * 1024 is treated as UNVERIFIED LEGACY CONFIGURATION. It is NOT accepted as a
 * BOT network identity and it may never be used for a mainnet transaction,
 * campaign rule, verifier rule, Activity record, wallet network request or
 * deployment configuration. Any production use fails closed here.
 */

export const BOT_MAINNET_CHAIN_ID = 677;
export const BOT_TESTNET_CHAIN_ID = 968;

/** Legacy value observed in pre-V30.1A FlowBridge configuration. Unproven. */
export const UNVERIFIED_LEGACY_BOT_IDENTIFIER = 1024;

export const BOT_EXPLORER_BASE: Record<number, string> = {
  [BOT_MAINNET_CHAIN_ID]: 'https://scan.botchain.ai',
  [BOT_TESTNET_CHAIN_ID]: 'https://testnet.botchain.ai',
};

export type NetworkEnvironment = 'mainnet' | 'testnet';

export type NetworkIdentifierClass =
  | 'BOT_MAINNET'
  | 'BOT_TESTNET'
  | 'UNVERIFIED_LEGACY'
  | 'FOREIGN';

/** Classify any numeric network identifier found in configuration or input. */
export function classifyNetworkIdentifier(value: unknown): NetworkIdentifierClass {
  if (typeof value !== 'number' || !Number.isInteger(value)) return 'FOREIGN';
  if (value === BOT_MAINNET_CHAIN_ID) return 'BOT_MAINNET';
  if (value === BOT_TESTNET_CHAIN_ID) return 'BOT_TESTNET';
  if (value === UNVERIFIED_LEGACY_BOT_IDENTIFIER) return 'UNVERIFIED_LEGACY';
  return 'FOREIGN';
}

/** Canonical chain id for a FlowBridge environment. */
export function botChainId(env: NetworkEnvironment): number {
  return env === 'mainnet' ? BOT_MAINNET_CHAIN_ID : BOT_TESTNET_CHAIN_ID;
}

export function isBotChainId(value: unknown): boolean {
  const cls = classifyNetworkIdentifier(value);
  return cls === 'BOT_MAINNET' || cls === 'BOT_TESTNET';
}

/**
 * Fail-closed guard for any production/network-facing identifier. Unproven
 * legacy values are rejected instead of being silently trusted.
 */
export function isProductionNetworkIdentifierAllowed(value: unknown): boolean {
  return classifyNetworkIdentifier(value) !== 'UNVERIFIED_LEGACY' &&
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 0;
}

export function assertProductionNetworkIdentifier(value: unknown, context: string): number {
  if (!isProductionNetworkIdentifierAllowed(value)) {
    throw new Error(
      `Unresolved network identifier ${String(value)} rejected in ${context}: ` +
        'BOT Mainnet is 677 and BOT Testnet is 968; 1024 is unverified legacy configuration.',
    );
  }
  return value as number;
}

export function explorerBaseForChain(chainId: number): string | null {
  return BOT_EXPLORER_BASE[chainId] ?? null;
}

export function botNetworkLabel(chainId: number): string | null {
  if (chainId === BOT_MAINNET_CHAIN_ID) return 'BOT Mainnet';
  if (chainId === BOT_TESTNET_CHAIN_ID) return 'BOT Testnet';
  return null;
}
