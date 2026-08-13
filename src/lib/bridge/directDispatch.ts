/**
 * Phase A1 — explicit bridge dispatch policy.
 *
 * The DEFAULT/production strategy for BNB <-> BOT is the direct official
 * gateway call from the user's wallet. The dormant BridgeAdapter branch is only
 * reachable when BOTH adapter feature flags are on AND the app is in testnet
 * mode (see `resolveAdapterDispatch`). With the flags unset this function always
 * returns the direct strategy, so the Adapter can never act as a fallback after
 * a wallet signature.
 */
import { resolveAdapterDispatch, type AdapterDispatchArgs } from './adapterDispatch';
import type { BridgeAdapterRoute } from './adapterConfig';

export type BridgeDispatchDecision =
  | { strategy: 'direct-official'; adapterRoute: null; reason: string }
  | { strategy: 'adapter-dormant-testnet'; adapterRoute: BridgeAdapterRoute; reason: string };

export function resolveBridgeDispatch(args: AdapterDispatchArgs): BridgeDispatchDecision {
  const adapterRoute = resolveAdapterDispatch(args);
  if (adapterRoute) {
    return {
      strategy: 'adapter-dormant-testnet',
      adapterRoute,
      reason: 'both adapter flags enabled on testnet for an active route',
    };
  }
  return {
    strategy: 'direct-official',
    adapterRoute: null,
    reason: 'default policy: user wallet calls the official gateway directly',
  };
}

/** The approval spender for the default path is always the official gateway. */
export function directApprovalSpender(officialGateway: string): string {
  return officialGateway;
}
