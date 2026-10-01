/**
 * V8-R — FlowBridgeRouterV4 ABI (verbatim from the user-provided integration
 * reference pack) plus the FlowBridgeRouterLens read ABI.
 *
 * Interface split proven on chain 968:
 *   - Execution + fee views  → FlowBridgeRouterV4
 *   - Registry discovery + quote views → FlowBridgeRouterLens
 * The Lens exposes the same signatures the V3 router used to serve, so the
 * discovery/quote strings below are copied unchanged from the pack ABI.
 */
import {
  FLOW_BRIDGE_ROUTER_LENS_GENERATED_ABI,
  FLOW_BRIDGE_ROUTER_V4_GENERATED_ABI,
} from './routerV4Abi.generated';

/**
 * FlowBridgeRouterV4 ABI — generated from the compiled extended candidate
 * (native BOT <-> BDEX V3 multi-pool). Only real `*Safe` selectors exist here;
 * legacy non fee-bound selectors were removed from V4 and must be addressed to
 * Router V3 with FLOW_BRIDGE_ROUTER_V3_ABI instead.
 */
export const FLOW_BRIDGE_ROUTER_V4_ABI = FLOW_BRIDGE_ROUTER_V4_GENERATED_ABI;

/** FlowBridgeRouterLens — read-only discovery + quote surface (generated). */
export const FLOW_BRIDGE_ROUTER_LENS_ABI = FLOW_BRIDGE_ROUTER_LENS_GENERATED_ABI;

/**
 * V30.1B.1 — Router V4 selectors REMOVED from the size-safe mainnet candidate
 * so the deployed code fits under EIP-170. Legacy (non fee-bound) swap
 * wrappers, the disabled bridge proxy execution surface and the read-only
 * discovery/quote helpers are gone; discovery and quoting are served by
 * FlowBridgeRouterLens, which already exposes the same signatures.
 */
export const V30_1B1_REMOVED_ROUTER_FUNCTIONS = [
  'swapV2',
  'swapV3Single',
  'swapV3Multi',
  'swapNativeToToken',
  'swapTokenToNative',
  'swapMultiHop',
  'bridgeWithFee',
  'bridgeBot',
  'getActiveRouters',
  'getActiveBridges',
  'getBridgeRouteConfig',
  'getBestV2Rate',
  'getV2RatesPage',
] as const;

/** Atomic native BOT <-> BDEX V3 multi-pool entry points added by the extended candidate. */
export const NATIVE_V3_MULTI_FUNCTIONS = [
  'swapNativeToTokenV3MultiSafe',
  'swapTokenToNativeV3MultiSafe',
] as const;

export type RemovedRouterFunction = (typeof V30_1B1_REMOVED_ROUTER_FUNCTIONS)[number];

/**
 * Router V4 mainnet (size-safe) execution + administration ABI. This is the
 * ONLY surface a BOT Mainnet 677 deployment exposes: fee-bound `*Safe` swaps,
 * fee views, registry metadata and governance. Discovery/quote reads must be
 * addressed to the Lens.
 */
export const FLOW_BRIDGE_ROUTER_V4_MAINNET_ABI = FLOW_BRIDGE_ROUTER_V4_GENERATED_ABI;

/** True when `name` no longer exists on the size-safe mainnet Router candidate. */
export function isRemovedOnMainnetRouter(name: string): boolean {
  return (V30_1B1_REMOVED_ROUTER_FUNCTIONS as readonly string[]).includes(name);
}
