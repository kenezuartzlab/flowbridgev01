/**
 * V8-R — Canonical FlowBridge execution registry (single source of truth).
 *
 * Every consumer that needs to know "which FlowBridge contract executes a swap
 * on this chain, and which contract answers discovery/quote reads" MUST resolve
 * it here. No consumer may hardcode a router address again.
 *
 * Deployment truth (user-provided manifest, validated on-chain):
 *   BOT Testnet (968)  FlowBridgeRouterV4 0xEcd8041a0aD94992a735a5d8AEB40D3e8B4d089A
 *                      FlowBridgeRouterLens 0x1F32C2d73Ed7D2878252De3Bb4c40bD07f36db2E
 *   BOT Mainnet (677)  FlowBridgeRouter v3 (existing production deployment) —
 *                      V4 mainnet deployment DEFERRED, so v3 stays authoritative.
 *   BNB chains (97/56) No FlowBridge execution contract — explicitly unconfigured.
 *
 * The official bridge stays DIRECT: V4 bridge-proxy execution is disabled
 * on-chain (`bridgeProxyExecutionEnabled(id) == false`), reflected below as
 * `bridgeProxyEnabled: false`.
 */
import { MAINNET_CONTRACTS, TESTNET_CONTRACTS } from '../contracts';
import { OFFICIAL_CHAIN_IDS } from '../bridge/officialBridgeConfig';

/** BOT chain IDs as used by the wallet/RPC layer (see src/lib/wagmi.ts). */
export const BOT_TESTNET_CHAIN_ID = OFFICIAL_CHAIN_IDS.botTestnet;
export const BOT_MAINNET_CHAIN_ID = 677;

export type Hex = `0x${string}`;

/**
 * `v4` = canonical Router V4 architecture target.
 * `v3-legacy` = pre-V4 deployment kept for backward compatibility ONLY. It is
 * never a V4 target and can never satisfy a V4 resolver check.
 */
export type FlowBridgeRouterVersion = 'v3-legacy' | 'v4';

export interface FlowBridgeExecutionTarget {
  configured: true;
  chainId: number;
  chainName: string;
  routerVersion: FlowBridgeRouterVersion;
  /** Swap execution target AND ERC-20 approval spender. */
  router: Hex;
  /** Discovery/quote reader. V4 chains use the Lens; legacy chains the router. */
  discovery: Hex;
  discoveryKind: 'lens' | 'router';
  /** V4 hardened `*Safe` entry points with an explicit maxProtocolFee bound. */
  supportsSafeSwaps: boolean;
  /** True only when an audited Router V4 address is deployed for this chain. */
  v4Configured: boolean;
  /** True only when V4 execution is allowed on this chain today. */
  v4Enabled: boolean;
  /** True while this chain still awaits its future V4 deployment gate. */
  promotionPending: boolean;
  /** Legacy-only target: intentionally supported, but outside V4 readiness. */
  legacy: boolean;
  /** V4 bridge proxy execution — false everywhere in V8-R (bridge stays direct). */
  bridgeProxyEnabled: boolean;
}


export interface FlowBridgeExecutionUnconfigured {
  configured: false;
  chainId: number;
  chainName: string;
  reason: string;
}

export type FlowBridgeExecutionResolution =
  | FlowBridgeExecutionTarget
  | FlowBridgeExecutionUnconfigured;

export class FlowBridgeExecutionUnconfiguredError extends Error {
  readonly chainId: number;
  constructor(chainId: number, reason: string) {
    super(`FlowBridge execution is not configured for chain ${chainId}: ${reason}`);
    this.name = 'FlowBridgeExecutionUnconfiguredError';
    this.chainId = chainId;
  }
}

/** BOT Testnet FlowBridgeRouterV4 (deployment truth — never guessed). */
export const FLOW_BRIDGE_ROUTER_V4_BOT_TESTNET: Hex =
  '0xecd8041a0ad94992a735a5d8aeb40d3e8b4d089a';
/** BOT Testnet FlowBridgeRouterLens paired with the V4 router above. */
export const FLOW_BRIDGE_ROUTER_LENS_BOT_TESTNET: Hex =
  '0x1f32c2d73ed7d2878252de3bb4c40bd07f36db2e';

const lower = (v: string) => v.toLowerCase() as Hex;

const REGISTRY: readonly FlowBridgeExecutionResolution[] = [
  {
    configured: true,
    chainId: BOT_TESTNET_CHAIN_ID,
    chainName: 'BOT Testnet',
    routerVersion: 'v4',
    router: FLOW_BRIDGE_ROUTER_V4_BOT_TESTNET,
    discovery: FLOW_BRIDGE_ROUTER_LENS_BOT_TESTNET,
    discoveryKind: 'lens',
    supportsSafeSwaps: true,
    v4Configured: true,
    v4Enabled: true,
    promotionPending: false,
    legacy: false,
    bridgeProxyEnabled: false,
  },
  {
    // TESTNET FIRST, MAINNET LATER: this is the pre-V4 production deployment,
    // retained for backward compatibility only. It is NOT a Router V4 target
    // and awaits a future audited V4 mainnet deployment gate.
    configured: true,
    chainId: BOT_MAINNET_CHAIN_ID,
    chainName: 'BOT Mainnet',
    routerVersion: 'v3-legacy',
    router: lower(MAINNET_CONTRACTS.flowBridgeRouterV3),
    discovery: lower(MAINNET_CONTRACTS.flowBridgeRouterV3),
    discoveryKind: 'router',
    supportsSafeSwaps: false,
    v4Configured: false,
    v4Enabled: false,
    promotionPending: true,
    legacy: true,
    bridgeProxyEnabled: false,
  },
  {
    configured: false,
    chainId: OFFICIAL_CHAIN_IDS.bnbTestnet,
    chainName: 'BNB Testnet',
    reason: 'no FlowBridge execution contract is deployed on this chain',
  },
  {
    configured: false,
    chainId: OFFICIAL_CHAIN_IDS.bnbMainnet,
    chainName: 'BNB Mainnet',
    reason: 'no FlowBridge execution contract is deployed on this chain',
  },
] as const;


/** Legacy v3 testnet router kept for audit/reference only — never for execution. */
export const LEGACY_FLOW_BRIDGE_ROUTER_V3_BOT_TESTNET: Hex = lower(
  TESTNET_CONTRACTS.flowBridgeRouterV3,
);

export function resolveFlowBridgeExecution(chainId: number): FlowBridgeExecutionResolution {
  return (
    REGISTRY.find((e) => e.chainId === chainId) ?? {
      configured: false,
      chainId,
      chainName: `chain ${chainId}`,
      reason: 'chain is not part of the FlowBridge execution registry',
    }
  );
}

/** Fail-closed resolution for write paths. */
export function requireFlowBridgeExecution(chainId: number): FlowBridgeExecutionTarget {
  const entry = resolveFlowBridgeExecution(chainId);
  if (!entry.configured) throw new FlowBridgeExecutionUnconfiguredError(chainId, entry.reason);
  return entry;
}

/** Convenience for UI code that only knows the mainnet/testnet toggle. */
export function flowBridgeChainId(isMainnet: boolean): number {
  return isMainnet ? BOT_MAINNET_CHAIN_ID : BOT_TESTNET_CHAIN_ID;
}

export function resolveFlowBridgeExecutionForNetwork(
  isMainnet: boolean,
): FlowBridgeExecutionTarget {
  return requireFlowBridgeExecution(flowBridgeChainId(isMainnet));
}

export function flowBridgeExecutionRegistry(): readonly FlowBridgeExecutionResolution[] {
  return REGISTRY;
}

// ── Router V4 readiness boundary ────────────────────────────────────────────
// V4 consumers (Campaign Studio, Verified Swap, Action Runner and any new
// execution work) MUST resolve through these helpers. A legacy `v3-legacy`
// target can never satisfy a V4 check, and no testnet address may ever resolve
// on a mainnet chain.

export function isFlowBridgeV4Target(
  entry: FlowBridgeExecutionResolution,
): entry is FlowBridgeExecutionTarget {
  return entry.configured && entry.routerVersion === 'v4' && entry.v4Configured && entry.v4Enabled;
}

/** V4-only resolution. Legacy/unknown chains resolve as unconfigured. */
export function resolveFlowBridgeV4Execution(chainId: number): FlowBridgeExecutionResolution {
  const entry = resolveFlowBridgeExecution(chainId);
  if (isFlowBridgeV4Target(entry)) return entry;
  if (entry.configured) {
    return {
      configured: false,
      chainId: entry.chainId,
      chainName: entry.chainName,
      reason: entry.promotionPending
        ? `FlowBridgeRouter V4 is not deployed on ${entry.chainName} yet (legacy ${entry.routerVersion} target, promotion pending)`
        : `${entry.chainName} is not a FlowBridgeRouter V4 target`,
    };
  }
  return entry;
}

/** Fail-closed V4 resolution for write paths and V4 API checks. */
export function requireFlowBridgeV4Execution(chainId: number): FlowBridgeExecutionTarget {
  const entry = resolveFlowBridgeV4Execution(chainId);
  if (!entry.configured) throw new FlowBridgeExecutionUnconfiguredError(chainId, entry.reason);
  return entry;
}

export function isFlowBridgeV4Configured(chainId: number): boolean {
  return resolveFlowBridgeV4Execution(chainId).configured;
}
