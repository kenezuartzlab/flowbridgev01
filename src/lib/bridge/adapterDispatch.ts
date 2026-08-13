/**
 * FlowBridge BridgeAdapter — Phase 4B DORMANT dispatch selector.
 *
 * Pure decision function used by App.tsx to decide, at the existing EVM bridge
 * dispatch point, whether a transaction should go through the Adapter helper
 * instead of the direct official gateway path.
 *
 * Returns null (→ existing behavior, untouched) unless EVERY condition holds:
 *   - application mode is TESTNET
 *   - preview flag ON   (VITE_ENABLE_BRIDGE_ADAPTER_TESTNET)
 *   - execution flag ON (VITE_ENABLE_BRIDGE_ADAPTER_EXECUTION_TESTNET)
 *   - direction is BNB_TO_BOT or BOT_TO_BNB
 *   - an active Adapter route exists for that direction
 *   - the connected wallet chain matches the route source chain
 */
import {
  ADAPTER_CHAIN_IDS,
  BRIDGE_ADAPTER_ROUTES,
  isBridgeAdapterExecutionTestnetEnabled,
  isBridgeAdapterTestnetEnabled,
  type BridgeAdapterRoute,
} from './adapterConfig';

export interface AdapterDispatchArgs {
  isMainnet: boolean;
  isDemoMode?: boolean;
  bridgeDirection: string;
  /** chain id the wallet is currently connected to */
  walletChainId?: number | null;
  /** test overrides */
  flagEnabled?: boolean;
  executionFlagEnabled?: boolean;
}

export function resolveAdapterDispatch(args: AdapterDispatchArgs): BridgeAdapterRoute | null {
  const previewFlag = args.flagEnabled ?? isBridgeAdapterTestnetEnabled();
  const executionFlag = args.executionFlagEnabled ?? isBridgeAdapterExecutionTestnetEnabled();
  if (!previewFlag || !executionFlag) return null;
  if (args.isMainnet) return null;
  if (args.isDemoMode) return null;
  if (args.bridgeDirection !== 'BNB_TO_BOT' && args.bridgeDirection !== 'BOT_TO_BNB') return null;

  const sourceChainId =
    args.bridgeDirection === 'BNB_TO_BOT' ? ADAPTER_CHAIN_IDS.bnbTestnet : ADAPTER_CHAIN_IDS.botTestnet;
  const destinationChainId =
    args.bridgeDirection === 'BNB_TO_BOT' ? ADAPTER_CHAIN_IDS.botTestnet : ADAPTER_CHAIN_IDS.bnbTestnet;

  const route = BRIDGE_ADAPTER_ROUTES.find(
    (r) => r.active && r.sourceChainId === sourceChainId && r.destinationChainId === destinationChainId,
  );
  if (!route) return null;
  if (args.walletChainId != null && args.walletChainId !== route.sourceChainId) return null;
  return route;
}
