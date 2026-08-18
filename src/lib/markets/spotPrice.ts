// Market (spot) prices for BOT Chain tokens.
//
// These are *mid/spot* prices read straight from pool state — the same basis
// used by charting/market sites (Ave.ai, BDEX, CaryPact "real-time price").
// They deliberately EXCLUDE swap fees, price impact and token transfer taxes,
// so they can differ from the executable quote shown on the swap cards.
//
//   BOT/USDT  →  BDex V3 pool slot0() sqrtPriceX96
//   CA/BOT    →  CaSwap V2 pair getReserves()

import { createPublicClient, http, parseAbi, type Address } from "viem";
import { botMainnet, botTestnet } from "@/lib/wagmi";
import { getContracts, UNISWAP_V3_POOL_ABI } from "@/lib/contracts";

const PAIR_ABI = parseAbi([
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
]);

const FACTORY_ABI = parseAbi([
  "function getPair(address tokenA, address tokenB) view returns (address pair)",
]);


const V3_TOKENS_ABI = parseAbi([
  "function token0() view returns (address)",
  "function token1() view returns (address)",
]);

const CLIENTS = new Map<string, any>();
function client(isMainnet: boolean) {
  const key = isMainnet ? "m" : "t";
  const hit = CLIENTS.get(key);
  if (hit) return hit;
  const c = createPublicClient({
    chain: isMainnet ? botMainnet : botTestnet,
    transport: http(undefined, { batch: { wait: 16, batchSize: 20 } }),
  });
  CLIENTS.set(key, c);
  return c;
}

export interface BotChainSpotPrices {
  /** BOT (and WBOT) mid price in USD, 0 when unavailable. */
  bot: number;
  /** CA mid price in USD, 0 when unavailable. */
  ca: number;
}

const Q96 = 2n ** 96n;
const SCALE = 10n ** 18n;

let cache: { at: number; isMainnet: boolean; prices: BotChainSpotPrices } | null = null;
const CACHE_MS = 20_000;

export async function fetchBotChainSpotPrices(isMainnet: boolean): Promise<BotChainSpotPrices> {
  if (cache && cache.isMainnet === isMainnet && Date.now() - cache.at < CACHE_MS) {
    return cache.prices;
  }
  const c = getContracts(isMainnet);
  const pub = client(isMainnet);
  const pool = c.usdtBotPoolV3.toLowerCase() as Address;
  const pair = c.caWbot.toLowerCase() as Address;
  const wbot = c.wbot.toLowerCase();
  const usdt = c.usdtBot.toLowerCase();
  const caToken = c.caToken.toLowerCase();

  const bot = await (async () => {
    try {
      const [slot0, token0] = await Promise.all([
        pub.readContract({ address: pool, abi: UNISWAP_V3_POOL_ABI, functionName: "slot0" }),
        pub.readContract({ address: pool, abi: V3_TOKENS_ABI, functionName: "token0" }),
      ]);
      const sqrtPriceX96 = (slot0 as readonly bigint[])[0] as bigint;
      if (!sqrtPriceX96) return 0;
      // price of token0 denominated in token1, scaled by 1e18 (raw units)
      const rawX18 = (sqrtPriceX96 * sqrtPriceX96 * SCALE) / (Q96 * Q96);
      const t0 = String(token0).toLowerCase();
      const botIsToken0 = t0 === wbot;
      // decimals: WBOT 18, USDT 6
      if (botIsToken0) {
        // USDT per WBOT: raw ratio * 10^(18-6)
        return Number(rawX18) / 1e18 * 1e12;
      }
      if (t0 !== usdt) return 0;
      // WBOT per USDT → invert
      const usdtPerBot = 1 / (Number(rawX18) / 1e18 * 1e-12);
      return Number.isFinite(usdtPerBot) ? usdtPerBot : 0;
    } catch {
      return 0;
    }
  })();

  const ca = await (async () => {
    if (bot <= 0) return 0;
    try {
      const [reserves, token0] = await Promise.all([
        pub.readContract({ address: pair, abi: PAIR_ABI, functionName: "getReserves" }),
        pub.readContract({ address: pair, abi: PAIR_ABI, functionName: "token0" }),
      ]);
      const [r0, r1] = reserves as readonly [bigint, bigint, number];
      if (r0 <= 0n || r1 <= 0n) return 0;
      const t0 = String(token0).toLowerCase();
      // CA and WBOT are both 18 decimals → plain reserve ratio
      const botPerCa =
        t0 === caToken ? Number(r1) / Number(r0) : t0 === wbot ? Number(r0) / Number(r1) : 0;
      if (!Number.isFinite(botPerCa) || botPerCa <= 0) return 0;
      return botPerCa * bot;
    } catch {
      return 0;
    }
  })();

  const prices: BotChainSpotPrices = { bot, ca };
  cache = { at: Date.now(), isMainnet, prices };
  return prices;
}
