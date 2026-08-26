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
import { parseAbi } from 'viem';

/** FlowBridgeRouterV4 ABI — legacy v3 calls + hardened v4 calls. */
export const FLOW_BRIDGE_ROUTER_V4_ABI = parseAbi([
  // Identity / ownership / pause
  'function owner() view returns (address)',
  'function pendingOwner() view returns (address)',
  'function paused() view returns (bool)',

  // Registry discovery (v3 compatible)
  'function getActiveRouters() view returns (uint256[] ids, string[] names, string[] versions, uint8[] types, address[] addrs)',
  'function getActiveBridges() view returns (uint256[] ids, string[] names, string[] destChainNames, uint256[] destChainIds, address[] addrs)',
  'function getBridgeSupportedTokens(uint256 bridgeId) view returns (address[])',
  'function getBridgeRouteConfig(uint256 bridgeId, address token) view returns (address gateway, uint256 destinationChainId, bytes32 resourceId, bool tokenSupported, bool botGasSupported, bool proxyExecutionEnabled, bool active)',
  'function bridgeProxyExecutionEnabled(uint256 bridgeId) view returns (bool)',
  'function setBridgeProxyExecutionEnabled(uint256 bridgeId, bool enabled)',

  // Fee views (v3 compatible + nonce)
  'function computeRouterFee(uint256 routerId, uint256 swapAmount, address user) view returns (uint256 fee, uint256 effectiveBps)',
  'function computeBridgeFee(uint256 bridgeId, uint256 bridgeAmount, address user) view returns (uint256 fee, uint256 effectiveBps)',
  'function getFeeConfig() view returns (uint256 globalFeeBps, uint256 maxFeeBps, address feeTreasury)',
  'function feeConfigNonce() view returns (uint256)',

  // V3-compatible swap entry points
  'function swapV2(uint256 routerId, uint256 swapAmount, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
  'function swapV3Single(uint256 routerId, address tokenIn, address tokenOut, uint24 feePool, uint256 swapAmount, uint256 amountOutMinimum, address to, uint256 deadline) returns (uint256 amountOut)',
  'function swapV3Multi(uint256 routerId, address tokenIn, address tokenOut, bytes encodedPath, uint256 swapAmount, uint256 amountOutMinimum, address to, uint256 deadline) returns (uint256 amountOut)',
  'function swapNativeToToken(uint256 routerId, address tokenOut, uint24 feePool, uint256 amountOutMin, address[] path, address to, uint256 deadline) payable returns (uint256 amountOut)',
  'function swapTokenToNative(uint256 routerId, address tokenIn, uint24 feePool, uint256 swapAmount, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256 amountOut)',
  'function swapMultiHop((uint256 routerId,address[] path,uint256 amountOutMin)[] hops, uint256 swapAmount, address to, uint256 deadline) returns (uint256 finalAmountOut)',

  // Hardened v4 swap entry points — use these in new UI
  'function swapV2Safe(uint256 routerId, uint256 swapAmount, uint256 amountOutMin, address[] path, address to, uint256 deadline, uint256 maxProtocolFee) returns (uint256[] amounts)',
  'function swapV3SingleSafe(uint256 routerId, address tokenIn, address tokenOut, uint24 feePool, uint256 swapAmount, uint256 amountOutMinimum, address to, uint256 deadline, uint256 maxProtocolFee) returns (uint256 amountOut)',
  'function swapV3MultiSafe(uint256 routerId, address tokenIn, address tokenOut, bytes encodedPath, uint256 swapAmount, uint256 amountOutMinimum, address to, uint256 deadline, uint256 maxProtocolFee) returns (uint256 amountOut)',
  'function swapNativeToTokenSafe(uint256 routerId, uint256 swapAmount, address tokenOut, uint24 feePool, uint256 amountOutMin, address[] path, address to, uint256 deadline, uint256 maxProtocolFee) payable returns (uint256 amountOut)',
  'function swapTokenToNativeSafe(uint256 routerId, address tokenIn, uint24 feePool, uint256 swapAmount, uint256 amountOutMin, address[] path, address to, uint256 deadline, uint256 maxProtocolFee) returns (uint256 amountOut)',
  'function swapMultiHopSafe((uint256 routerId,address[] path,uint256 amountOutMin)[] hops, uint256 swapAmount, address to, uint256 deadline, uint256 maxProtocolFee) returns (uint256 finalAmountOut)',

  // Bridge — legacy and preferred v4
  'function bridgeWithFee(uint256 bridgeId, address token, uint256 bridgeAmount) returns (bool)',
  'function bridgeBot(uint256 bridgeId, address token, uint256 bridgeAmount, address recipient, bool withBotGas, uint256 maxProtocolFee, uint256 expectedFeeConfigNonce) returns (bool)',

  // Quotes
  'function getBestV2Rate(uint256 amountIn, address[] path) view returns (uint256 bestRouterId, uint256 bestAmountOut, uint256[] allAmountsOut)',
  'function getV2RatesPage(uint256 amountIn, address[] path, uint256 start, uint256 count) view returns (uint256[] ids, uint256[] amountsOut)',

  // Activity events for rewards/indexing
  'event SwapActivity(address indexed sender, address indexed recipient, uint256 indexed routerId, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 protocolFee)',
  'event BridgeActivity(address indexed sender, address indexed recipient, uint256 indexed bridgeId, address token, bytes32 resourceId, uint256 destinationChainId, uint256 amount, uint256 protocolFee, bool withBotGas)',
]);

/**
 * FlowBridgeRouterLens — read-only discovery + quote surface that accompanies
 * FlowBridgeRouterV4. Confirmed on chain 968: `flowRouter()` points at the V4
 * router, and `getActiveRouters()` / `getBestV2Rate()` live here, not on V4.
 */
export const FLOW_BRIDGE_ROUTER_LENS_ABI = parseAbi([
  'function flowRouter() view returns (address)',
  'function getActiveRouters() view returns (uint256[] ids, string[] names, string[] versions, uint8[] types, address[] addrs)',
  'function getActiveBridges() view returns (uint256[] ids, string[] names, string[] destChainNames, uint256[] destChainIds, address[] addrs)',
  'function getBestV2Rate(uint256 amountIn, address[] path) view returns (uint256 bestRouterId, uint256 bestAmountOut, uint256[] allAmountsOut)',
  'function getV2RatesPage(uint256 amountIn, address[] path, uint256 start, uint256 count) view returns (uint256[] ids, uint256[] amountsOut)',
  // V30.1B hardened lens reads (explicit no-route signal + bounded discovery).
  'function findBestV2Rate(uint256 amountIn, address[] path) view returns (bool found, uint256 bestRouterId, uint256 bestAmountOut, uint256[] allAmountsOut)',
  'function getRoutersPage(uint256 start, uint256 count) view returns (uint256[] ids, string[] names, string[] versions, uint8[] types, address[] addrs, bool[] active)',
  'function getBridgesPage(uint256 start, uint256 count) view returns (uint256[] ids, string[] names, string[] destChainNames, uint256[] destChainIds, address[] addrs, bool[] active)',
]);

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

export type RemovedRouterFunction = (typeof V30_1B1_REMOVED_ROUTER_FUNCTIONS)[number];

/**
 * Router V4 mainnet (size-safe) execution + administration ABI. This is the
 * ONLY surface a BOT Mainnet 677 deployment exposes: fee-bound `*Safe` swaps,
 * fee views, registry metadata and governance. Discovery/quote reads must be
 * addressed to the Lens.
 */
export const FLOW_BRIDGE_ROUTER_V4_MAINNET_ABI = parseAbi([
  'function owner() view returns (address)',
  'function pendingOwner() view returns (address)',
  'function paused() view returns (bool)',

  'function computeRouterFee(uint256 routerId, uint256 swapAmount, address user) view returns (uint256 fee, uint256 effectiveBps)',
  'function computeBridgeFee(uint256 bridgeId, uint256 bridgeAmount, address user) view returns (uint256 fee, uint256 effectiveBps)',
  'function getFeeConfig() view returns (uint256 globalFeeBps, uint256 maxFeeBps, address feeTreasury)',
  'function feeConfigNonce() view returns (uint256)',

  'function getBridgeSupportedTokens(uint256 bridgeId) view returns (address[])',
  'function bridgeProxyExecutionEnabled(uint256 bridgeId) view returns (bool)',
  'function bridgeResourceId(uint256 bridgeId, address token) view returns (bytes32)',
  'function bridgeTokenSupported(uint256 bridgeId, address token) view returns (bool)',
  'function bridgeSupportsBotGas(uint256 bridgeId) view returns (bool)',

  'function swapV2Safe(uint256 routerId, uint256 swapAmount, uint256 amountOutMin, address[] path, address to, uint256 deadline, uint256 maxProtocolFee) returns (uint256[] amounts)',
  'function swapV3SingleSafe(uint256 routerId, address tokenIn, address tokenOut, uint24 feePool, uint256 swapAmount, uint256 amountOutMinimum, address to, uint256 deadline, uint256 maxProtocolFee) returns (uint256 amountOut)',
  'function swapV3MultiSafe(uint256 routerId, address tokenIn, address tokenOut, bytes encodedPath, uint256 swapAmount, uint256 amountOutMinimum, address to, uint256 deadline, uint256 maxProtocolFee) returns (uint256 amountOut)',
  'function swapNativeToTokenSafe(uint256 routerId, uint256 swapAmount, address tokenOut, uint24 feePool, uint256 amountOutMin, address[] path, address to, uint256 deadline, uint256 maxProtocolFee) payable returns (uint256 amountOut)',
  'function swapTokenToNativeSafe(uint256 routerId, address tokenIn, uint24 feePool, uint256 swapAmount, uint256 amountOutMin, address[] path, address to, uint256 deadline, uint256 maxProtocolFee) returns (uint256 amountOut)',
  'function swapMultiHopSafe((uint256 routerId,address[] path,uint256 amountOutMin)[] hops, uint256 swapAmount, address to, uint256 deadline, uint256 maxProtocolFee) returns (uint256 finalAmountOut)',

  'event SwapActivity(address indexed sender, address indexed recipient, uint256 indexed routerId, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 protocolFee)',
]);

/** True when `name` no longer exists on the size-safe mainnet Router candidate. */
export function isRemovedOnMainnetRouter(name: string): boolean {
  return (V30_1B1_REMOVED_ROUTER_FUNCTIONS as readonly string[]).includes(name);
}
