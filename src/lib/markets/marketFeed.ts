// Aggregates live market data for the /markets page.
// BOT chain tokens: derived from on-chain quoter (getBestRoute → USDT).
// Cross-chain (ETH/BSC/TRON): CoinGecko free public API with in-memory cache.

import { getBestRoute } from "@/lib/swap/quoter";
import { getContracts } from "@/lib/contracts";
import { NATIVE_TOKEN_ADDRESS, type Token } from "@/lib/swap/tokenRegistry";

export type Chain = "BOT" | "ETH" | "BSC" | "TRON";

export interface MarketRow {
  id: string;
  symbol: string;
  name: string;
  chain: Chain;
  priceUsd: number;
  change24h: number | null;
  marketCap: number | null;
  volume24h?: number | null;
  /** 7d price points, oldest → newest (external tokens only). */
  sparkline?: number[] | null;
}

// ── BOT Chain ─────────────────────────────────────────────────────────────
export async function fetchBotChainMarkets(isMainnet: boolean): Promise<MarketRow[]> {
  const rows: MarketRow[] = [];
  const c = getContracts(isMainnet);

  const usdt: Token = { address: c.usdtBot.toLowerCase(), symbol: "USDT", name: "Tether USD", decimals: 6 };
  const bot: Token = { address: NATIVE_TOKEN_ADDRESS, symbol: "BOT", name: "BOT", decimals: 18, isNative: true };
  const ca: Token = { address: c.caToken.toLowerCase(), symbol: "CA", name: "CaryPact", decimals: 18 };

  const priceOf = async (tok: Token): Promise<number> => {
    try {
      const r = await getBestRoute(tok, usdt, 10n ** BigInt(tok.decimals), isMainnet);
      if (!r || r.amountOut <= 0n) return 0;
      return Number(r.amountOut) / 1e6;
    } catch {
      return 0;
    }
  };
  const [botPrice, caPrice] = await Promise.all([priceOf(bot), priceOf(ca)]);


  rows.push({
    id: "bot",
    symbol: "BOT",
    name: "BOT Chain (native)",
    chain: "BOT",
    priceUsd: botPrice,
    change24h: null,
    marketCap: null,
  });
  rows.push({
    id: "wbot",
    symbol: "WBOT",
    name: "Wrapped BOT",
    chain: "BOT",
    priceUsd: botPrice,
    change24h: null,
    marketCap: null,
  });
  rows.push({
    id: "usdt-bot",
    symbol: "USDT",
    name: "Tether USD (BOT Chain)",
    chain: "BOT",
    priceUsd: 1,
    change24h: 0,
    marketCap: null,
  });
  rows.push({
    id: "ca",
    symbol: "CA",
    name: "CaryPact",
    chain: "BOT",
    priceUsd: caPrice,
    change24h: null,
    marketCap: null,
  });
  return rows;
}

async function safeCall<T>(fn: () => Promise<T> | T): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

// ── Cross-chain via CoinGecko ─────────────────────────────────────────────
// Top popular tokens per chain — mixed L1s + majors on each chain.
const CG_IDS = [
  // ETH ecosystem
  { id: "ethereum", chain: "ETH" as Chain },
  { id: "usd-coin", chain: "ETH" as Chain },
  { id: "tether", chain: "ETH" as Chain },
  { id: "shiba-inu", chain: "ETH" as Chain },
  { id: "chainlink", chain: "ETH" as Chain },
  { id: "uniswap", chain: "ETH" as Chain },
  // BSC ecosystem
  { id: "binancecoin", chain: "BSC" as Chain },
  { id: "pancakeswap-token", chain: "BSC" as Chain },
  { id: "binance-usd", chain: "BSC" as Chain },
  // TRON ecosystem
  { id: "tron", chain: "TRON" as Chain },
  { id: "just", chain: "TRON" as Chain },
  { id: "sun-token", chain: "TRON" as Chain },
];

interface CgCoin {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number | null;
  market_cap: number | null;
}

let cache: { at: number; rows: MarketRow[] } | null = null;
const CACHE_MS = 60_000;

export async function fetchExternalMarkets(): Promise<MarketRow[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  const ids = CG_IDS.map((c) => c.id).join(",");
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("cg http " + res.status);
    const data = (await res.json()) as CgCoin[];
    const chainById = new Map(CG_IDS.map((c) => [c.id, c.chain]));
    const rows: MarketRow[] = data.map((c) => ({
      id: c.id,
      symbol: (c.symbol ?? "").toUpperCase(),
      name: c.name,
      chain: chainById.get(c.id) ?? "ETH",
      priceUsd: Number(c.current_price ?? 0),
      change24h: c.price_change_percentage_24h ?? null,
      marketCap: c.market_cap ?? null,
    }));
    cache = { at: Date.now(), rows };
    return rows;
  } catch {
    return cache?.rows ?? [];
  }
}
