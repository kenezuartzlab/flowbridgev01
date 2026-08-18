// Market (reference) prices for BOT Chain tokens.
//
// This is the *market* basis used by charting sites (Ave.ai, BDEX) and the
// CaryPact "real-time price" card — NOT the executable sell quote shown on the
// swap cards, which additionally pays CA's temporary sell tax.
//
//   BOT/USDT  ->  BDex V3 pool slot0() sqrtPriceX96 (mid price)
//   CA        ->  buy-side reference: how much CA 1 BOT buys on CaSwap
//                 (excludes the CA sell tax, matching Ave.ai / CaryPact)

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
  const factory = c.caSwapFactory.toLowerCase() as Address;
  const caWnative = c.caWbot.toLowerCase() as Address;

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
      const { getBestRoute } = await import("@/lib/swap/quoter");
      const one = 10n ** 18n;
      const r = await getBestRoute(
        { address: "native", symbol: "BOT", name: "BOT", decimals: 18, isNative: true } as any,
        { address: c.caToken.toLowerCase(), symbol: "CA", name: "CaryPact", decimals: 18 } as any,
        one,
        isMainnet,
      );
      const caPerBot = Number(r?.amountOut ?? 0n) / 1e18;
      if (!Number.isFinite(caPerBot) || caPerBot <= 0) return 0;
      return bot / caPerBot;
    } catch {
      return 0;
    }
  })();

  const prices: BotChainSpotPrices = { bot, ca };
  cache = { at: Date.now(), isMainnet, prices };
  return prices;
}
