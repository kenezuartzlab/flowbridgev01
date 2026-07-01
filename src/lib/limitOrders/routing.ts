// Routing table for FlowLimitOrderExecutor. The executor stores ONE routerId per
// order, so only routes that live on a single registered DEX are placeable.
//
//   routerId 0 = CaSwap V2   (CA ↔ BOT via caWBOT)
//   routerId 2 = BDex V3     (BOT ↔ USDT, feePool 3000)
//
// CA↔USDT requires V2 + V3 which is not single-router. It is intentionally not
// placeable as a limit order — users are told to use instant swap.

import type { Address } from "viem";
import { getContracts } from "@/lib/contracts";
import { NATIVE_TOKEN_ADDRESS, type Token } from "@/lib/swap/tokenRegistry";

export interface LimitRoute {
  routerId: number;
  feePoolV3: number; // 0 for V2 routes
  // Actual ERC20 addresses submitted to placeOrder (native BOT is wrapped to WBOT).
  onchainTokenIn: Address;
  onchainTokenOut: Address;
  // If tokenIn is native BOT, the user must wrap to this WBOT variant first.
  needsWrap: null | { wbot: Address; label: "WBOT" | "caWBOT" };
  // Router-native symbol on the executor side (for the WBOT variant used).
  wnativeSymbol: "WBOT" | "caWBOT";
  humanLabel: string;
}

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function isNative(t: Token) {
  return t.isNative || eq(t.address, NATIVE_TOKEN_ADDRESS);
}

/**
 * Resolve the on-chain routing for a limit order. Returns null if the pair is
 * not placeable as a single-router limit order (e.g. CA↔USDT).
 */
export function resolveLimitRoute(
  tokenIn: Token,
  tokenOut: Token,
  isMainnet: boolean,
): LimitRoute | null {
  const c = getContracts(isMainnet);
  const CA = c.caToken.toLowerCase();
  const USDT = c.usdtBot.toLowerCase();
  const WBOT = c.wbot.toLowerCase() as Address;
  const CAWBOT = c.caWbot.toLowerCase() as Address;

  const inNative = isNative(tokenIn);
  const outNative = isNative(tokenOut);
  const inAddr = inNative ? "native" : tokenIn.address.toLowerCase();
  const outAddr = outNative ? "native" : tokenOut.address.toLowerCase();

  // Identity guard.
  if (inAddr === outAddr) return null;

  const isBotSide = (a: string) => a === "native" || a === WBOT;

  // ── BOT ↔ USDT via BDex V3 (routerId 2) ────────────────────────────────
  if ((isBotSide(inAddr) && outAddr === USDT) || (inAddr === USDT && isBotSide(outAddr))) {
    const inIsBot = isBotSide(inAddr);
    return {
      routerId: 2,
      feePoolV3: 3000,
      onchainTokenIn: (inIsBot ? WBOT : (USDT as Address)) as Address,
      onchainTokenOut: (inIsBot ? (USDT as Address) : WBOT) as Address,
      needsWrap: inNative ? { wbot: WBOT, label: "WBOT" } : null,
      wnativeSymbol: "WBOT",
      humanLabel: "BDex V3 · BOT/USDT (0.30%)",
    };
  }

  // ── CA ↔ BOT via CaSwap V2 (routerId 0, uses caWBOT) ───────────────────
  if ((inAddr === CA && isBotSide(outAddr)) || (isBotSide(inAddr) && outAddr === CA)) {
    const inIsCa = inAddr === CA;
    return {
      routerId: 0,
      feePoolV3: 0,
      onchainTokenIn: (inIsCa ? (CA as Address) : CAWBOT) as Address,
      onchainTokenOut: (inIsCa ? CAWBOT : (CA as Address)) as Address,
      needsWrap: inNative ? { wbot: CAWBOT, label: "caWBOT" } : null,
      wnativeSymbol: "caWBOT",
      humanLabel: "CaSwap V2 · CA/BOT",
    };
  }

  // Unsupported single-router pair (e.g. CA↔USDT needs V2+V3).
  return null;
}

/** True if the pair has no single-router path in the executor. */
export function isCrossRouterPair(tokenIn: Token, tokenOut: Token, isMainnet: boolean): boolean {
  if (resolveLimitRoute(tokenIn, tokenOut, isMainnet)) return false;
  const c = getContracts(isMainnet);
  const CA = c.caToken.toLowerCase();
  const USDT = c.usdtBot.toLowerCase();
  const a = tokenIn.address.toLowerCase();
  const b = tokenOut.address.toLowerCase();
  return (a === CA && b === USDT) || (a === USDT && b === CA);
}
