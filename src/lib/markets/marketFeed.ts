// Aggregates live market data for the /markets page.
// BOT chain tokens: derived from on-chain quoter (getBestRoute → USDT).
// Cross-chain (ETH/BSC/TRON): CoinGecko free public API with in-memory cache.

import { getContracts } from "@/lib/contracts";
import { fetchBotChainSpotPrices } from "@/lib/markets/spotPrice";

export type Chain = "BOT" | "MAJOR" | "ETH" | "BSC" | "TRON";

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
  // Market prices (mid / buy-side reference), NOT the executable sell quote.
  const { bot: botPrice, ca: caPrice } = await fetchBotChainSpotPrices(isMainnet);

  return [
    {
      id: "bot",
      symbol: "BOT",
      name: "BOT Chain (native)",
      chain: "BOT",
      priceUsd: botPrice,
      change24h: null,
      marketCap: null,
    },
    {
      id: "wbot",
      symbol: "WBOT",
      name: "Wrapped BOT",
      chain: "BOT",
      priceUsd: botPrice,
      change24h: null,
      marketCap: null,
    },
    {
      id: "usdt-bot",
      symbol: "USDT",
      name: "Tether USD (BOT Chain)",
      chain: "BOT",
      priceUsd: 1,
      change24h: 0,
      marketCap: null,
    },
    {
      id: "ca",
      symbol: "CA",
      name: "CaryPact",
      chain: "BOT",
      priceUsd: caPrice,
      change24h: null,
      marketCap: null,
    },
  ];
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
  // Majors (multi-chain / L1 references, incl. BTC)
  { id: "bitcoin", chain: "MAJOR" as Chain },
  { id: "solana", chain: "MAJOR" as Chain },
  { id: "dogecoin", chain: "MAJOR" as Chain },
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
  total_volume: number | null;
  sparkline_in_7d?: { price: number[] } | null;
}

let cache: { at: number; rows: MarketRow[] } | null = null;
const CACHE_MS = 60_000;

export async function fetchExternalMarkets(): Promise<MarketRow[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  const ids = CG_IDS.map((c) => c.id).join(",");
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=50&page=1&sparkline=true&price_change_percentage=24h`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("cg http " + res.status);
    const data = (await res.json()) as CgCoin[];
    const chainById = new Map(CG_IDS.map((c) => [c.id, c.chain]));
    const rows: MarketRow[] = data.map((c) => {
      const pts = c.sparkline_in_7d?.price ?? [];
      // Downsample to ~24 points to keep the inline chart cheap to render.
      const step = pts.length > 24 ? Math.ceil(pts.length / 24) : 1;
      return {
        id: c.id,
        symbol: (c.symbol ?? "").toUpperCase(),
        name: c.name,
        chain: chainById.get(c.id) ?? "ETH",
        priceUsd: Number(c.current_price ?? 0),
        change24h: c.price_change_percentage_24h ?? null,
        marketCap: c.market_cap ?? null,
        volume24h: c.total_volume ?? null,
        sparkline: pts.length ? pts.filter((_, i) => i % step === 0) : null,
      };
    });
    cache = { at: Date.now(), rows };
    return rows;
  } catch {
    return cache?.rows ?? [];
  }
}
