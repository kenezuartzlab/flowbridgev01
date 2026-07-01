// Multi-hop, multi-DEX quoter.
//
// Supports two DEXes on BOT Chain:
//   - Bohr DEX  (bdexFactory / bdexRouter, wrapped native = WBOT)
//       · V2-style getAmountsOut for most pairs
//       · V3 pool (usdtBotPoolV3) for BOT/USDT — quoted via slot0
//   - CaryPact  (caSwapFactory / caSwapRouter, wrapped native = caWBOT, V2 only)
//
// CA token has liquidity only on CaryPact. CA ↔ USDT is split:
//   CA → BOT (CaSwap V2) + BOT → USDT (Bohr V3) — two transactions.

import { createPublicClient, http, parseAbi, type Address } from "viem";
import { botMainnet, botTestnet } from "@/lib/wagmi";
import {
  getContracts,
  UNISWAP_V2_ROUTER_ABI,
  UNISWAP_V3_POOL_ABI,
} from "@/lib/contracts";
import { NATIVE_TOKEN_ADDRESS, type Token } from "./tokenRegistry";

const FACTORY_ABI = parseAbi([
  "function getPair(address tokenA, address tokenB) view returns (address pair)",
]);

const ZERO = "0x0000000000000000000000000000000000000000" as const;

export type DexId = "bohr" | "caswap" | "bdex-v3";

// FlowBridgeRouter v3 registry IDs (identical on mainnet + testnet):
//   0 = CaSwap V2, 1 = BDex V2, 2 = BDex V3.
export const ROUTER_ID: Record<DexId, number> = {
  caswap: 0,
  bohr: 1,
  "bdex-v3": 2,
};

export interface SwapStep {
  dex: DexId;
  routerId: number;           // FlowBridgeRouter v3 registry ID
  router: Address;            // underlying DEX router (kept for backwards-compat / display)
  path: Address[];            // ERC20 path passed to the router (V2) or [tokenIn,tokenOut] (V3)
  symbolPath: string[];       // for display
  inIsNative: boolean;
  outIsNative: boolean;
  expectedOut: bigint;
  // V3-only:
  v3Fee?: number;             // Uniswap V3 pool fee (e.g. 3000 = 0.3%)
}


export interface QuoteResult {
  amountOut: bigint;          // final out (after last step)
  steps: SwapStep[];
  symbolPath: string[];       // combined human path, e.g. ["CA","BOT","USDT"]
  path: Address[];            // first step's path (back-compat)
}

interface DexCfg {
  id: "bohr" | "caswap";
  factory: Address;
  router: Address;
  wnative: Address;
}

function publicClient(isMainnet: boolean) {
  return createPublicClient({
    chain: isMainnet ? botMainnet : botTestnet,
    transport: http(),
  });
}

function v2Dexes(isMainnet: boolean): DexCfg[] {
  const c = getContracts(isMainnet);
  return [
    {
      id: "bohr",
      factory: c.bdexFactory.toLowerCase() as Address,
      router: c.bdexRouter.toLowerCase() as Address,
      wnative: c.wbot.toLowerCase() as Address,
    },
    {
      id: "caswap",
      factory: c.caSwapFactory.toLowerCase() as Address,
      router: c.caSwapRouter.toLowerCase() as Address,
      wnative: c.caWbot.toLowerCase() as Address,
    },
  ];
}

async function pairExists(
  client: ReturnType<typeof publicClient>,
  factory: Address,
  a: Address,
  b: Address,
): Promise<boolean> {
  try {
    const pair = (await client.readContract({
      address: factory,
      abi: FACTORY_ABI,
      functionName: "getPair",
      args: [a, b],
    })) as Address;
    return pair.toLowerCase() !== ZERO;
  } catch {
    return false;
  }
}

async function getAmountsOut(
  client: ReturnType<typeof publicClient>,
  router: Address,
  amountIn: bigint,
  path: Address[],
): Promise<bigint | null> {
  try {
    const amounts = (await client.readContract({
      address: router,
      abi: UNISWAP_V2_ROUTER_ABI,
      functionName: "getAmountsOut",
      args: [amountIn, path],
    })) as readonly bigint[];
    return amounts[amounts.length - 1];
  } catch {
    return null;
  }
}

function addrFor(token: Token, dex: DexCfg): Address {
  return (token.isNative ? dex.wnative : token.address).toLowerCase() as Address;
}

// Detect BOT/USDT pair (either token may be native BOT or WBOT).
function isBotUsdtPair(
  tokenIn: Token,
  tokenOut: Token,
  wbot: Address,
  usdt: Address,
): { isBotIn: boolean } | null {
  const inAddr = (tokenIn.isNative ? wbot : tokenIn.address.toLowerCase()) as Address;
  const outAddr = (tokenOut.isNative ? wbot : tokenOut.address.toLowerCase()) as Address;
  if (inAddr === wbot && outAddr === usdt) return { isBotIn: true };
  if (inAddr === usdt && outAddr === wbot) return { isBotIn: false };
  return null;
}

// V3 quote for the WBOT/USDT pool. token0 = USDT (6dec), token1 = WBOT (18dec).
// Returns expected output applying the pool fee. Spot-price approximation —
// fine for retail-sized trades against the deep V3 pool.
async function quoteV3BotUsdt(
  client: ReturnType<typeof publicClient>,
  poolV3: Address,
  isBotIn: boolean,
  amountIn: bigint,
): Promise<{ amountOut: bigint; fee: number } | null> {
  try {
    const [slot0, fee] = await Promise.all([
      client.readContract({
        address: poolV3,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: "slot0",
      }) as Promise<readonly [bigint, ...unknown[]]>,
      client.readContract({
        address: poolV3,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: "fee",
      }) as Promise<number>,
    ]);
    const sqrtPriceX96 = BigInt(slot0[0].toString());
    if (sqrtPriceX96 <= 0n) return null;
    const Q192 = 1n << 192n;
    const sp2 = sqrtPriceX96 * sqrtPriceX96;
    // raw price P = sp2 / Q192 represents raw_token1 per raw_token0 (= raw WBOT per raw USDT).
    let outRaw: bigint;
    if (isBotIn) {
      // BOT (token1) -> USDT (token0): outRaw_usdt = amountIn_bot * Q192 / sp2
      outRaw = (amountIn * Q192) / sp2;
    } else {
      // USDT (token0) -> BOT (token1): outRaw_bot = amountIn_usdt * sp2 / Q192
      outRaw = (amountIn * sp2) / Q192;
    }
    const feeNum = Number(fee);
    const after = (outRaw * BigInt(1_000_000 - feeNum)) / 1_000_000n;
    return { amountOut: after, fee: feeNum };
  } catch {
    return null;
  }
}

// Build a single BOT↔USDT step (V3).
async function botUsdtStep(
  client: ReturnType<typeof publicClient>,
  isMainnet: boolean,
  tokenIn: Token,
  tokenOut: Token,
  amountIn: bigint,
): Promise<SwapStep | null> {
  const c = getContracts(isMainnet);
  const wbot = c.wbot.toLowerCase() as Address;
  const usdt = c.usdtBot.toLowerCase() as Address;
  const poolV3 = c.usdtBotPoolV3.toLowerCase() as Address;
  const bdexRouter = c.bdexRouter.toLowerCase() as Address;

  const detect = isBotUsdtPair(tokenIn, tokenOut, wbot, usdt);
  if (!detect) return null;

  const q = await quoteV3BotUsdt(client, poolV3, detect.isBotIn, amountIn);
  if (!q || q.amountOut <= 0n) return null;

  const inAddr = detect.isBotIn ? wbot : usdt;
  const outAddr = detect.isBotIn ? usdt : wbot;

  return {
    dex: "bdex-v3",
    routerId: ROUTER_ID["bdex-v3"],
    router: bdexRouter,
    path: [inAddr, outAddr],
    symbolPath: [
      detect.isBotIn ? "BOT" : "USDT",
      detect.isBotIn ? "USDT" : "BOT",
    ],
    inIsNative: !!tokenIn.isNative,
    outIsNative: !!tokenOut.isNative,
    expectedOut: q.amountOut,
    v3Fee: q.fee,
  };

}

// Best single-DEX V2 quote (direct, hop-via-wnative, hop-via-usdt).
async function bestOnV2Dex(
  client: ReturnType<typeof publicClient>,
  dex: DexCfg,
  usdt: Address,
  tokenIn: Token,
  tokenOut: Token,
  amountIn: bigint,
): Promise<{ amountOut: bigint; path: Address[]; symbolPath: string[] } | null> {
  const inA = addrFor(tokenIn, dex);
  const outA = addrFor(tokenOut, dex);
  if (inA === outA) return null;

  const candidates: { path: Address[]; symbolPath: string[] }[] = [];

  if (await pairExists(client, dex.factory, inA, outA)) {
    candidates.push({ path: [inA, outA], symbolPath: [tokenIn.symbol, tokenOut.symbol] });
  }
  if (inA !== dex.wnative && outA !== dex.wnative) {
    if (
      (await pairExists(client, dex.factory, inA, dex.wnative)) &&
      (await pairExists(client, dex.factory, dex.wnative, outA))
    ) {
      candidates.push({
        path: [inA, dex.wnative, outA],
        symbolPath: [tokenIn.symbol, "BOT", tokenOut.symbol],
      });
    }
  }
  if (inA !== usdt && outA !== usdt) {
    if (
      (await pairExists(client, dex.factory, inA, usdt)) &&
      (await pairExists(client, dex.factory, usdt, outA))
    ) {
      candidates.push({
        path: [inA, usdt, outA],
        symbolPath: [tokenIn.symbol, "USDT", tokenOut.symbol],
      });
    }
  }

  let best: { amountOut: bigint; path: Address[]; symbolPath: string[] } | null = null;
  for (const c of candidates) {
    const out = await getAmountsOut(client, dex.router, amountIn, c.path);
    if (out !== null && out > 0n && (!best || out > best.amountOut)) {
      best = { amountOut: out, path: c.path, symbolPath: c.symbolPath };
    }
  }
  return best;
}

const NATIVE_BOT: Token = {
  address: NATIVE_TOKEN_ADDRESS,
  symbol: "BOT",
  name: "BOT (native)",
  decimals: 18,
  isNative: true,
};

const USDT_TOKEN = (isMainnet: boolean): Token => {
  const c = getContracts(isMainnet);
  return {
    address: c.usdtBot.toLowerCase(),
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
  };
};

export async function getBestRoute(
  tokenIn: Token,
  tokenOut: Token,
  amountIn: bigint,
  isMainnet: boolean,
): Promise<QuoteResult | null> {
  if (amountIn <= 0n) return null;
  if (
    tokenIn.address.toLowerCase() === tokenOut.address.toLowerCase() &&
    tokenIn.isNative === tokenOut.isNative
  )
    return null;

  const c = getContracts(isMainnet);
  const wbot = c.wbot.toLowerCase() as Address;
  const usdt = c.usdtBot.toLowerCase() as Address;
  const client = publicClient(isMainnet);
  const allV2 = v2Dexes(isMainnet);

  const candidates: QuoteResult[] = [];

  // ── 1. Direct BOT↔USDT via Bohr V3 ─────────────────────────────────────
  {
    const v3 = await botUsdtStep(client, isMainnet, tokenIn, tokenOut, amountIn);
    if (v3) {
      candidates.push({
        amountOut: v3.expectedOut,
        path: v3.path,
        symbolPath: v3.symbolPath,
        steps: [v3],
      });
    }
  }

  // ── 2. Single-DEX V2 routes ────────────────────────────────────────────
  for (const dex of allV2) {
    const r = await bestOnV2Dex(client, dex, usdt, tokenIn, tokenOut, amountIn);
    if (r) {
      candidates.push({
        amountOut: r.amountOut,
        path: r.path,
        symbolPath: r.symbolPath,
        steps: [
          {
            dex: dex.id,
            router: dex.router,
            path: r.path,
            symbolPath: r.symbolPath,
            inIsNative: !!tokenIn.isNative,
            outIsNative: !!tokenOut.isNative,
            expectedOut: r.amountOut,
          },
        ],
      });
    }
  }

  // ── 3. Cross-DEX split via native BOT (V2 ↔ V2) ────────────────────────
  if (!(tokenIn.isNative || tokenOut.isNative)) {
    for (const dexA of allV2) {
      for (const dexB of allV2) {
        if (dexA.id === dexB.id) continue;
        const leg1 = await bestOnV2Dex(client, dexA, usdt, tokenIn, NATIVE_BOT, amountIn);
        if (!leg1) continue;
        const leg2 = await bestOnV2Dex(client, dexB, usdt, NATIVE_BOT, tokenOut, leg1.amountOut);
        if (!leg2) continue;
        candidates.push({
          amountOut: leg2.amountOut,
          path: leg1.path,
          symbolPath: [...leg1.symbolPath, ...leg2.symbolPath.slice(1)],
          steps: [
            {
              dex: dexA.id,
              router: dexA.router,
              path: leg1.path,
              symbolPath: leg1.symbolPath,
              inIsNative: !!tokenIn.isNative,
              outIsNative: true,
              expectedOut: leg1.amountOut,
            },
            {
              dex: dexB.id,
              router: dexB.router,
              path: leg2.path,
              symbolPath: leg2.symbolPath,
              inIsNative: true,
              outIsNative: !!tokenOut.isNative,
              expectedOut: leg2.amountOut,
            },
          ],
        });
      }
    }
  }

  // ── 4. Split via BOT where one side is USDT (uses V3 for BOT↔USDT) ─────
  //   e.g. CA → USDT  :  CA → BOT (CaSwap V2)  +  BOT → USDT (Bohr V3)
  //        USDT → CA  :  USDT → BOT (Bohr V3)  +  BOT → CA (CaSwap V2)
  const tokenInIsUsdt =
    !tokenIn.isNative && tokenIn.address.toLowerCase() === usdt;
  const tokenOutIsUsdt =
    !tokenOut.isNative && tokenOut.address.toLowerCase() === usdt;
  const usdtToken = USDT_TOKEN(isMainnet);

  if (tokenOutIsUsdt && !tokenIn.isNative && tokenIn.address.toLowerCase() !== usdt) {
    // tokenIn → BOT on each V2 dex, then BOT → USDT via V3
    for (const dexA of allV2) {
      const leg1 = await bestOnV2Dex(client, dexA, usdt, tokenIn, NATIVE_BOT, amountIn);
      if (!leg1) continue;
      const leg2 = await botUsdtStep(client, isMainnet, NATIVE_BOT, usdtToken, leg1.amountOut);
      if (!leg2) continue;
      candidates.push({
        amountOut: leg2.expectedOut,
        path: leg1.path,
        symbolPath: [...leg1.symbolPath, "USDT"],
        steps: [
          {
            dex: dexA.id,
            router: dexA.router,
            path: leg1.path,
            symbolPath: leg1.symbolPath,
            inIsNative: !!tokenIn.isNative,
            outIsNative: true,
            expectedOut: leg1.amountOut,
          },
          leg2,
        ],
      });
    }
  }

  if (tokenInIsUsdt && !tokenOut.isNative && tokenOut.address.toLowerCase() !== usdt) {
    // USDT → BOT via V3, then BOT → tokenOut on each V2 dex
    const leg1 = await botUsdtStep(client, isMainnet, usdtToken, NATIVE_BOT, amountIn);
    if (leg1) {
      for (const dexB of allV2) {
        const leg2 = await bestOnV2Dex(client, dexB, usdt, NATIVE_BOT, tokenOut, leg1.expectedOut);
        if (!leg2) continue;
        candidates.push({
          amountOut: leg2.amountOut,
          path: leg1.path,
          symbolPath: ["USDT", ...leg2.symbolPath],
          steps: [
            leg1,
            {
              dex: dexB.id,
              router: dexB.router,
              path: leg2.path,
              symbolPath: leg2.symbolPath,
              inIsNative: true,
              outIsNative: !!tokenOut.isNative,
              expectedOut: leg2.amountOut,
            },
          ],
        });
      }
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (b.amountOut > a.amountOut ? 1 : b.amountOut < a.amountOut ? -1 : 0));
  return candidates[0];
}

export async function hasAnyLiquidity(
  tokenAddress: string,
  isMainnet: boolean,
): Promise<boolean> {
  const c = getContracts(isMainnet);
  const client = publicClient(isMainnet);
  const candidate = tokenAddress.toLowerCase() as Address;
  const usdt = c.usdtBot.toLowerCase() as Address;
  for (const dex of v2Dexes(isMainnet)) {
    if (candidate === dex.wnative || candidate === usdt) return true;
    const [a, b] = await Promise.all([
      pairExists(client, dex.factory, candidate, dex.wnative),
      pairExists(client, dex.factory, candidate, usdt),
    ]);
    if (a || b) return true;
  }
  return false;
}

export { NATIVE_TOKEN_ADDRESS };
