/**
 * FlowBridge BridgeAdapter configuration — Phase 2 scaffolding ONLY.
 *
 * This module lives in parallel with the existing bridge configuration in
 * `src/lib/contracts.ts`. Nothing here is routed into a live transaction yet;
 * the legacy gateway/token constants remain the single source of truth for
 * execution until the feature flag below is deliberately switched on.
 */

export type Hex = `0x${string}`;

/** Chain ids relevant to the testnet adapter rollout. */
export const ADAPTER_CHAIN_IDS = {
  botTestnet: 968,
  bnbTestnet: 97,
  sepolia: 11155111,
} as const;

/** USDT route tokens used by the tested adapter routes. */
export const ADAPTER_TOKENS = {
  usdtBotTestnet: '0x75edC9335175Fc0552D51D48439F229c10420fe3' as Hex,
  usdtBnbTestnet: '0x5d012516D129Ab3aE7673FE32E5ABFCD9be4d086' as Hex,
  usdtSepolia: '0x7B1e05a39adF207a759EAf89E867dBcC1C615130' as Hex,
} as const;

export interface BridgeAdapterRoute {
  id: string;
  label: string;
  adapter: Hex;
  sourceChainId: number;
  destinationChainId: number;
  sourceToken: Hex;
  destinationToken: Hex;
  /** ERC-20 decimals of the SOURCE token — used to encode previewSource(amount). */
  sourceDecimals: number;
  /** ERC-20 decimals of the DESTINATION token. */
  destinationDecimals: number;
  /** false = present for reference/beta, must not be offered or executed. */
  active: boolean;
  beta?: boolean;
}

export const BRIDGE_ADAPTER_ROUTES: readonly BridgeAdapterRoute[] = [
  {
    id: 'bnbTestnet->botTestnet',
    label: 'BNB Testnet → BOT Testnet',
    adapter: '0x8DCCA27e9c96491Cc27974a14Fd60fA1bBF23065',
    sourceChainId: ADAPTER_CHAIN_IDS.bnbTestnet,
    destinationChainId: ADAPTER_CHAIN_IDS.botTestnet,
    sourceToken: ADAPTER_TOKENS.usdtBnbTestnet,
    destinationToken: ADAPTER_TOKENS.usdtBotTestnet,
    sourceDecimals: 18,
    destinationDecimals: 6,
    active: true,
  },
  {
    id: 'botTestnet->bnbTestnet',
    label: 'BOT Testnet → BNB Testnet',
    adapter: '0xeb875735711Bf1C4ad35642C0c77f6079F30Ea17',
    sourceChainId: ADAPTER_CHAIN_IDS.botTestnet,
    destinationChainId: ADAPTER_CHAIN_IDS.bnbTestnet,
    sourceToken: ADAPTER_TOKENS.usdtBotTestnet,
    destinationToken: ADAPTER_TOKENS.usdtBnbTestnet,
    sourceDecimals: 6,
    destinationDecimals: 18,
    active: true,
  },
  {
    id: 'sepolia->botTestnet',
    label: 'Sepolia → BOT Testnet (beta)',
    adapter: '0x7FE51363C6694ACddf3EBBF64B2d4A7Ef970ecB4',
    sourceChainId: ADAPTER_CHAIN_IDS.sepolia,
    destinationChainId: ADAPTER_CHAIN_IDS.botTestnet,
    sourceToken: ADAPTER_TOKENS.usdtSepolia,
    destinationToken: ADAPTER_TOKENS.usdtBotTestnet,
    sourceDecimals: 6,
    destinationDecimals: 6,
    active: false,
    beta: true,
  },
] as const;

/**
 * Feature flag: VITE_ENABLE_BRIDGE_ADAPTER_TESTNET.
 * Defaults to false when unset or set to anything other than "true"/"1".
 */
export function isBridgeAdapterTestnetEnabled(): boolean {
  const raw = import.meta.env.VITE_ENABLE_BRIDGE_ADAPTER_TESTNET;
  if (typeof raw !== 'string') return false;
  const v = raw.trim().toLowerCase();
  return v === 'true' || v === '1';
}

/** Lookup helper for future phases. Returns undefined when the flag is off. */
export function findBridgeAdapterRoute(
  sourceChainId: number,
  destinationChainId: number,
): BridgeAdapterRoute | undefined {
  if (!isBridgeAdapterTestnetEnabled()) return undefined;
  return BRIDGE_ADAPTER_ROUTES.find(
    (r) => r.active && r.sourceChainId === sourceChainId && r.destinationChainId === destinationChainId,
  );
}
