/**
 * Liquidity V1 — venue adapters. Each venue is independent and exposes only
 * capabilities verified on-chain (bytecode selectors read 2026-10-02):
 *
 *   BDEX V2  (677 router 0x1414…9e76 / 968 router 0xD642…7345)
 *     addLiquidity, addLiquidityETH, removeLiquidity, removeLiquidityETH,
 *     factory.createPair/getPair/allPairs — WETH() = WBOT.
 *   CaSwap   (677 router 0x5b90…41AD / 968 router 0xa5fa…1747)
 *     same V2 selectors; wrapped native via WBOT() (no WETH()). IMPORTANT: on
 *     677 router.factory() = 0x9c93…a38d (holds CA/WBOT 0x0A0c…94F6), NOT the
 *     app's recorded caSwapFactory — the factory is always read from the router.
 *   BDEX V3  NonfungiblePositionManager 0xDAc3…0090, factory 0x1C51…5419,
 *     enabled tiers read live (500/3000/10000 on both chains; 100 disabled).
 *
 * CaSwap is never substituted by BDEX (or vice versa).
 */
import type { Address } from "viem";
import { MAINNET_CONTRACTS, TESTNET_CONTRACTS } from "@/lib/contracts";
import { getVerifiedV3 } from "@/lib/swap/dexVerification";

export type LiquidityVenueId = "bdex-v2" | "bdex-v3" | "caswap";

export interface VenueCapabilities {
  addLiquidity: boolean;
  removeLiquidity: boolean;
  createPool: boolean;
  lpDiscovery: boolean;
  nativeBot: boolean;
  positionNft: boolean;
  collectFees: boolean;
}

export interface V2Venue {
  id: "bdex-v2" | "caswap";
  kind: "v2";
  label: string;
  chainId: number;
  router: Address;
  /** Getter on the router for the wrapped native token. */
  wrappedGetter: "WETH" | "WBOT";
  caps: VenueCapabilities;
}

export interface V3Venue {
  id: "bdex-v3";
  kind: "v3";
  label: string;
  chainId: number;
  factory: Address;
  positionManager: Address;
  wrappedNative: Address;
  caps: VenueCapabilities;
}

export type LiquidityVenue = V2Venue | V3Venue;

const V2_CAPS: VenueCapabilities = { addLiquidity: true, removeLiquidity: true, createPool: true, lpDiscovery: true, nativeBot: true, positionNft: false, collectFees: false };
/** CaSwap router reverts addLiquidity* with "CASwapRouter: LP_NOT_ALLOWED" for non-allowlisted wallets (verified 677 + 968, 2026-10-02). */
const CASWAP_CAPS: VenueCapabilities = { ...V2_CAPS, addLiquidity: false, createPool: false };
const V3_CAPS: VenueCapabilities = { addLiquidity: true, removeLiquidity: true, createPool: true, lpDiscovery: true, nativeBot: false, positionNft: true, collectFees: true };

export function getLiquidityVenues(chainId: number): LiquidityVenue[] {
  const c = chainId === 677 ? MAINNET_CONTRACTS : chainId === 968 ? TESTNET_CONTRACTS : null;
  if (!c) return [];
  const out: LiquidityVenue[] = [
    { id: "bdex-v2", kind: "v2", label: "BDEX V2", chainId, router: c.bdexV2Router as Address, wrappedGetter: "WETH", caps: V2_CAPS },
  ];
  const v3 = getVerifiedV3(chainId);
  if (v3) out.push({ id: "bdex-v3", kind: "v3", label: "BDEX V3", chainId, factory: v3.factory, positionManager: v3.positionManager, wrappedNative: v3.wrappedNative, caps: V3_CAPS });
  out.push({ id: "caswap", kind: "v2", label: "CaSwap", chainId, router: c.caSwapRouter as Address, wrappedGetter: "WBOT", caps: CASWAP_CAPS });
  return out;
}

export function getVenue(chainId: number, id: LiquidityVenueId): LiquidityVenue | undefined {
  return getLiquidityVenues(chainId).find((v) => v.id === id);
}

/** Strict venue isolation: a request for venue X is only ever served by X. */
export function assertVenue(requested: LiquidityVenueId, served: LiquidityVenueId): void {
  if (requested !== served) throw new Error(`Venue mismatch: ${requested} requested, ${served} offered — refusing silent substitution`);
}

export const CASWAP_CAPABILITY_MATRIX = {
  addLiquidity: "NOT SUPPORTED (router allowlist — LP_NOT_ALLOWED for public wallets)",
  removeLiquidity: "SUPPORTED for existing LP holders (removeLiquidity/removeLiquidityETH present; not rehearsed — no LP held)",
  createPair: "NOT SUPPORTED via router (pair creation happens through the restricted addLiquidity path)",
  lpDiscovery: "SUPPORTED",
  nativeBot: "SUPPORTED (router WBOT(); addLiquidityETH/removeLiquidityETH)",
  feeRetrieval: "LP fees accrue inside reserves (no separate claim)",
  lpBalanceShare: "SUPPORTED (pair balanceOf / totalSupply / getReserves)",
} as const;
