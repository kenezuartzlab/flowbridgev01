/**
 * V15.2 — deterministic bridge-route availability for ActionIntents.
 *
 * Pure lookup against the official bridge route config. Flow AI may never claim
 * a route exists that this table does not list.
 */
import {
  OFFICIAL_CHAIN_IDS,
  OFFICIAL_TESTNET_ROUTES,
} from "@/lib/bridge/officialBridgeConfig";
import { BOT_MAINNET_CHAIN_ID, BOT_TESTNET_CHAIN_ID } from "./actionIntent";

/** V30.1A: canonical BOT identities only — mainnet 677, testnet 968. */
const BOT_CHAIN_ALIASES = new Set<number>([
  BOT_TESTNET_CHAIN_ID,
  BOT_MAINNET_CHAIN_ID,
  OFFICIAL_CHAIN_IDS.botMainnet,
  OFFICIAL_CHAIN_IDS.botTestnet,
]);

export function isOfficialBridgeRoute(sourceChainId: number, destinationChainId: number): boolean {
  if (sourceChainId === destinationChainId) return false;

  if (sourceChainId === BOT_TESTNET_CHAIN_ID || sourceChainId === OFFICIAL_CHAIN_IDS.botTestnet) {
    return OFFICIAL_TESTNET_ROUTES.some(
      (r) =>
        r.sourceChainId === OFFICIAL_CHAIN_IDS.botTestnet &&
        r.destinationChainId === destinationChainId,
    );
  }

  if (sourceChainId === BOT_MAINNET_CHAIN_ID || sourceChainId === OFFICIAL_CHAIN_IDS.botMainnet) {
    // Mainnet outbound USDT to BNB mainnet is the only published route.
    return destinationChainId === OFFICIAL_CHAIN_IDS.bnbMainnet;
  }

  // Inbound routes: only from a supported BNB chain into a BOT chain.
  const inboundOk =
    (sourceChainId === OFFICIAL_CHAIN_IDS.bnbTestnet ||
      sourceChainId === OFFICIAL_CHAIN_IDS.bnbMainnet) &&
    BOT_CHAIN_ALIASES.has(destinationChainId);
  return inboundOk;
}
