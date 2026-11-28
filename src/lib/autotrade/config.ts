// AutoTrade V1 — Ops/Admin-only price-target orders. Pure config; no signer, no keys.
// Routes reuse the deployed Router V4 registry (routerId 0 = BDEX V3, verified live
// 2026-11-26 at BOT block 31,625,366). No new contract, no registry change required.
import { MAINNET_CONTRACTS as M } from "@/lib/contracts";

/** Hard kill switches. Live trading needs a code change plus explicit signer approval. */
export const AUTOTRADE_PUBLIC_ENABLED = false as const;
export const AUTOTRADE_LIVE_ENABLED = false as const;

export const ROUTER_V4 = "0x79653140D84B78C19354ee984f236Ec92160fc61" as const;
export const ROUTER_V4_BDEX_V3_ID = 0;
export const ROUTER_V4_FEE_BPS_BDEX_V3 = 1; // per-router fee set by owner tx 0xddafc28b… (router-v4-native-v3-multi/README); re-read on chain before live

export interface TokenRef { symbol: string; address: string; decimals: number; native?: boolean }
export const TOKENS = {
  BOT: { symbol: "BOT", address: M.wbot, decimals: 18, native: true },
  USDT: { symbol: "USDT", address: M.usdtBot, decimals: 6 },
  CA: { symbol: "CA", address: M.caToken, decimals: 18 },
  FLOW: { symbol: "FLOW", address: M.flowToken, decimals: 18 },
} as const satisfies Record<string, TokenRef>;

export interface AutoTradePair {
  id: "CA/BOT" | "CA/USDT" | "BOT/USDT" | "FLOW/USDT";
  base: TokenRef; quote: TokenRef;
  /** V3 path base -> quote (tokens) with fee tiers; buy uses the reverse. */
  path: string[]; fees: number[];
  venue: "BDEX V3"; routerId: number;
}

export const AUTOTRADE_PAIRS: readonly AutoTradePair[] = [
  { id: "CA/BOT", base: TOKENS.CA, quote: TOKENS.BOT, path: [M.caToken, M.wbot], fees: [10000], venue: "BDEX V3", routerId: 0 },
  { id: "CA/USDT", base: TOKENS.CA, quote: TOKENS.USDT, path: [M.caToken, M.wbot, M.usdtBot], fees: [10000, 3000], venue: "BDEX V3", routerId: 0 },
  { id: "BOT/USDT", base: TOKENS.BOT, quote: TOKENS.USDT, path: [M.wbot, M.usdtBot], fees: [3000], venue: "BDEX V3", routerId: 0 },
  { id: "FLOW/USDT", base: TOKENS.FLOW, quote: TOKENS.USDT, path: [M.flowToken, M.usdtBot], fees: [10000], venue: "BDEX V3", routerId: 0 },
];

/** Venues considered and why they are not used for AutoTrade V1 (evidence in docs). */
export const EXCLUDED_VENUES = [
  { venue: "CaSwap V2", reason: "Quote-only alternative: not registered in Router V4, uses caWBOT (not WBOT), and the verified mutable CA→caWBOT fee is 7,300 bps (73%), above the 500 bps safety cap. No atomic caWBOT/USDT route is eligible." },
  { venue: "BDEX V2", reason: "Not registered in Router V4; only WBOT/USDT exists and BDEX V3 0.3% quotes better." },
] as const;

export const GUARDS = {
  maxQuoteAgeMs: 15_000,
  maxQuoteBlockLag: 3,
  maxSourceDeviationBps: 50,
  maxPriceImpactBps: 300,
  minConfirmations: 6,
  maxSlippageBps: 300,
  maxExpiryMs: 7 * 24 * 3600_000,
} as const;

export function pairById(id: string): AutoTradePair | undefined { return AUTOTRADE_PAIRS.find((p) => p.id === id); }
