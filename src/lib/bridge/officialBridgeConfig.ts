/**
 * Phase A1 — isolated, environment-aware config for the OFFICIAL BOT Bridge
 * route used by the production/default BNB <-> BOT bridge path.
 *
 * This module is descriptive only: it never sends a transaction and never
 * hardcodes fee economics. Fees stay whatever the official gateway reads/charges.
 * FlowBridge is never the depositor: the user wallet calls the gateway directly
 * and the ERC-20 approval spender is always the official gateway.
 */

export type Hex = `0x${string}`;

export const OFFICIAL_CHAIN_IDS = {
  botMainnet: 1024,
  botTestnet: 968,
  bnbMainnet: 56,
  bnbTestnet: 97,
} as const;

export interface OfficialBridgeRoute {
  id: 'BNB_TO_BOT' | 'BOT_TO_BNB';
  sourceChainId: number;
  destinationChainId: number;
  /** Official gateway/router contract on the SOURCE chain (approval spender). */
  gateway: Hex;
  /** Source USDT token address. */
  sourceToken: Hex;
  /** ERC-20 decimals of the SOURCE token. BNB USDT = 18, BOT USDT = 6. */
  sourceDecimals: number;
  /** Always true in Phase A1: the user wallet calls the gateway itself. */
  direct: true;
}

/** Official TESTNET route config (verified against the Phase A1 spec). */
export const OFFICIAL_TESTNET_ROUTES: readonly OfficialBridgeRoute[] = [
  {
    id: 'BNB_TO_BOT',
    sourceChainId: OFFICIAL_CHAIN_IDS.bnbTestnet,
    destinationChainId: OFFICIAL_CHAIN_IDS.botTestnet,
    gateway: '0xbCAA929FdB16f5a7185C96A4Ed0CC4F25ab86E40',
    sourceToken: '0x5d012516D129Ab3aE7673FE32E5ABFCD9be4d086',
    sourceDecimals: 18,
    direct: true,
  },
  {
    id: 'BOT_TO_BNB',
    sourceChainId: OFFICIAL_CHAIN_IDS.botTestnet,
    destinationChainId: OFFICIAL_CHAIN_IDS.bnbTestnet,
    gateway: '0x6239404Aa276ba68486E2Fa40E90CDd36ff8ec3A',
    sourceToken: '0x75edC9335175Fc0552D51D48439F229c10420fe3',
    sourceDecimals: 6,
    direct: true,
  },
] as const;

/**
 * Mainnet source decimals are unchanged policy, not new addresses: mainnet
 * gateway addresses keep coming from `src/lib/contracts.ts` so no new mainnet
 * contract is activated in this phase.
 */
export const OFFICIAL_SOURCE_DECIMALS: Record<number, number> = {
  [OFFICIAL_CHAIN_IDS.bnbTestnet]: 18,
  [OFFICIAL_CHAIN_IDS.bnbMainnet]: 18,
  [OFFICIAL_CHAIN_IDS.botTestnet]: 6,
  [OFFICIAL_CHAIN_IDS.botMainnet]: 6,
};

export function findOfficialTestnetRoute(
  direction: string,
): OfficialBridgeRoute | undefined {
  return OFFICIAL_TESTNET_ROUTES.find((r) => r.id === direction);
}

/** SOURCE-token decimals for an official BNB<->BOT route. */
export function officialSourceDecimals(sourceChainId: number): number | undefined {
  return OFFICIAL_SOURCE_DECIMALS[sourceChainId];
}
