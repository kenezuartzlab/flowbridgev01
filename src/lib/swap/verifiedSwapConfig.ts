/**
 * V8 — Verified Swap Adapter configuration (server-owned truth).
 *
 * This module is the ONLY place that may name a swap execution target for
 * verified activity. Router / token / chain are never accepted from the
 * browser, from query parameters or from a request body.
 *
 * Supported V8 path (deliberately ONE path, ERC-20 token-in only):
 *   BOT Testnet (968) · FlowBridgeRouter v3 · USDT token-in
 *
 * Native token-in is intentionally unsupported: it produces no ERC-20 Transfer
 * log, so the token-in amount could not be proven deterministically.
 */
import { keccak256, toBytes, toFunctionSelector } from 'viem';
import { TESTNET_CONTRACTS } from '../contracts';
import { OFFICIAL_CHAIN_IDS } from '../bridge/officialBridgeConfig';
import { requireFlowBridgeV4Execution } from '../flowbridge/executionRegistry';
import { readPublicBuildFlag } from '../config/publicBuildFlags';



export type Hex = `0x${string}`;

/**
 * Frozen FlowBridge verified swap V1 action type.
 * keccak256("FLOWBRIDGE_VERIFIED_SWAP_V1"). Never equal to
 * DIRECT_BRIDGE_ACTION_TYPE, which stays untouched.
 */
export const VERIFIED_SWAP_V1_ACTION_TYPE: Hex = keccak256(
  toBytes('FLOWBRIDGE_VERIFIED_SWAP_V1'),
);

export interface VerifiedSwapPath {
  id: string;
  label: string;
  /** Execution chain. Same-chain action: source === destination. */
  chainId: number;
  /** Configured swap execution target (FlowBridgeRouter v3). */
  router: Hex;
  /** Configured ERC-20 token-in. */
  tokenIn: Hex;
  tokenInDecimals: number;
  tokenInSymbol: string;
  /**
   * V8.3 — trusted wrapped-native endpoint the underlying BDEX V2 path must
   * terminate at (execution proof). This is NOT the user-facing output asset.
   */
  tokenOut: Hex;
  /** User-facing output symbol (native BOT for the approved V8.3 path). */
  tokenOutSymbol: string;
  /** True when the user-facing output asset is the chain's native coin. */
  outputIsNative: boolean;
  /**
   * Semantic Router V4 `SwapActivity.tokenOut` value for this path.
   * address(0) for token-to-native execution (semantic native-output proof).
   */
  eventTokenOut: Hex;
  /** Live Lens-derived BDEX V2 routerId for the approved route. */
  routerId: bigint;
  /** Exact approved Router V4 hardened entrypoint. */
  safeFunctionName: 'swapTokenToNativeSafe';
  safeFunctionSignature: string;
  /** 4-byte selector of `safeFunctionSignature`. */
  safeSelector: Hex;
}

/** Frozen approved Router V4 safe entrypoint for the single V8.3 swap path. */
export const VERIFIED_SWAP_SAFE_SIGNATURE =
  'swapTokenToNativeSafe(uint256,address,uint24,uint256,uint256,address[],address,uint256,uint256)' as const;
export const VERIFIED_SWAP_SAFE_SELECTOR: Hex = toFunctionSelector(
  `function ${VERIFIED_SWAP_SAFE_SIGNATURE}`,
);

/** Native-output semantic tokenOut emitted by Router V4 SwapActivity. */
export const NATIVE_OUTPUT_EVENT_TOKEN: Hex = '0x0000000000000000000000000000000000000000';

export const VERIFIED_SWAP_PATHS: readonly VerifiedSwapPath[] = [
  {
    id: 'bot-testnet-usdt',
    label: 'BOT Testnet · USDT → BOT (native) swap via FlowBridgeRouter V4 (BDEX V2, routerId 0)',
    chainId: OFFICIAL_CHAIN_IDS.botTestnet,
    // Canonical Router V4 execution target (V4 resolver — legacy targets rejected).
    router: requireFlowBridgeV4Execution(OFFICIAL_CHAIN_IDS.botTestnet).router,
    tokenIn: TESTNET_CONTRACTS.usdtBot.toLowerCase() as Hex,
    tokenInDecimals: 6,
    tokenInSymbol: 'USDT',
    // Execution proof only: the V2 path must end at wrapped native (WBOT).
    tokenOut: TESTNET_CONTRACTS.wbot.toLowerCase() as Hex,
    tokenOutSymbol: 'BOT',
    outputIsNative: true,
    eventTokenOut: NATIVE_OUTPUT_EVENT_TOKEN,
    routerId: 0n,
    safeFunctionName: 'swapTokenToNativeSafe',
    safeFunctionSignature: VERIFIED_SWAP_SAFE_SIGNATURE,
    safeSelector: VERIFIED_SWAP_SAFE_SELECTOR,
  },
] as const;


const eq = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Supported path lookup. Token-in is optional; when given it must match. */
export function findVerifiedSwapPath(
  chainId: number,
  tokenIn?: string,
): VerifiedSwapPath | undefined {
  return VERIFIED_SWAP_PATHS.find(
    (p) => p.chainId === chainId && (tokenIn === undefined || eq(p.tokenIn, tokenIn)),
  );
}

/**
 * Attribution flag (V8.2): resolved through the public build flag source so a
 * production build cannot silently lose it. Explicit
 * VITE_ENABLE_VERIFIED_SWAP_ACTIVITY always wins; otherwise the committed
 * public default applies; otherwise OFF.
 */
export function isVerifiedSwapActivityEnabled(): boolean {
  return readPublicBuildFlag('ENABLE_VERIFIED_SWAP_ACTIVITY');
}

