// Multi-hop, multi-DEX quoter.
//
// Supports two DEXes on BOT Chain:
//   - Bohr DEX  (bdexFactory / bdexRouter, wrapped native = WBOT)
//   - CaryPact  (caSwapFactory / caSwapRouter, wrapped native = caWBOT)
//
// CA token has liquidity only on CaryPact. To swap CA ↔ USDT we split
// the route at native BOT: CA → BOT on CaryPact, then BOT → USDT on Bohr
// (or the reverse), executed as two sequential transactions.

import { createPublicClient, http, parseAbi, type Address } from "viem";
import { botMainnet, botTestnet } from "@/lib/wagmi";
import { getContracts, UNISWAP_V2_ROUTER_ABI } from "@/lib/contracts";
import { NATIVE_TOKEN_ADDRESS, type Token } from "./tokenRegistry";

const FACTORY_ABI = parseAbi([
  "function getPair(address tokenA, address tokenB) view returns (address pair)",
]);

const ZERO = "0x0000000000000000000000000000000000000000" as const;

export type DexId = "bohr" | "caswap";

export interface SwapStep {
  dex: DexId;
  router: Address;
  path: Address[];            // ERC20 path passed to the router
  symbolPath: string[];       // for display (uses native BOT symbol where applicable)
  inIsNative: boolean;
  outIsNative: boolean;
  expectedOut: bigint;
}

export interface QuoteResult {
  amountOut: bigint;          // final out (after last step)
  steps: SwapStep[];
  symbolPath: string[];       // combined human path, e.g. ["CA","BOT","USDT"]
  // Back-compat (single-step legacy callers): first step's path
  path: Address[];
}

interface DexCfg {
  id: DexId;
  factory: Address;
  router: Address;
  wnative: Address; // wbot for bohr, caWbot for caswap
}

function publicClient(isMainnet: boolean) {
  return createPublicClient({
    chain: isMainnet ? botMainnet : botTestnet,
    transport: http(),
  });
}

function dexes(isMainnet: boolean): DexCfg[] {
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

// On-chain ERC20 address to use for a token on a given DEX
// (native BOT becomes that DEX's wrapped-native).
function addrFor(token: Token, dex: DexCfg): Address {
  return (token.isNative ? dex.wnative : token.address).toLowerCase() as Address;
}

// Best single-DEX quote (direct, hop-via-wnative, hop-via-usdt) for tokenIn→tokenOut.
async function bestOnDex(
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

// Synthetic native-BOT token for cross-DEX split.
const NATIVE_BOT: Token = {
  address: NATIVE_TOKEN_ADDRESS,
  symbol: "BOT",
  name: "BOT (native)",
  decimals: 18,
  isNative: true,
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
  const usdt = c.usdtBot.toLowerCase() as Address;
  const client = publicClient(isMainnet);
  const allDexes = dexes(isMainnet);

  // ── 1. Single-DEX routes ────────────────────────────────────────────────
  const singleCandidates: QuoteResult[] = [];
  for (const dex of allDexes) {
    const r = await bestOnDex(client, dex, usdt, tokenIn, tokenOut, amountIn);
    if (r) {
      singleCandidates.push({
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

  // ── 2. Cross-DEX split via native BOT ───────────────────────────────────
  // Useful when one DEX has tokenIn↔BOT liquidity but not tokenIn↔tokenOut.
  const crossCandidates: QuoteResult[] = [];
  if (!(tokenIn.isNative || tokenOut.isNative)) {
    for (const dexA of allDexes) {
      for (const dexB of allDexes) {
        if (dexA.id === dexB.id) continue;
        // Leg 1: tokenIn → native BOT on dexA
        const leg1 = await bestOnDex(client, dexA, usdt, tokenIn, NATIVE_BOT, amountIn);
        if (!leg1) continue;
        // Leg 2: native BOT → tokenOut on dexB
        const leg2 = await bestOnDex(client, dexB, usdt, NATIVE_BOT, tokenOut, leg1.amountOut);
        if (!leg2) continue;

        const combinedSymbols = [...leg1.symbolPath, ...leg2.symbolPath.slice(1)];
        crossCandidates.push({
          amountOut: leg2.amountOut,
          path: leg1.path,
          symbolPath: combinedSymbols,
          steps: [
            {
              dex: dexA.id,
              router: dexA.router,
              path: leg1.path,
              symbolPath: leg1.symbolPath,
              inIsNative: !!tokenIn.isNative,
              outIsNative: true, // unwrap to native BOT
              expectedOut: leg1.amountOut,
            },
            {
              dex: dexB.id,
              router: dexB.router,
              path: leg2.path,
              symbolPath: leg2.symbolPath,
              inIsNative: true,  // wrap from native BOT
              outIsNative: !!tokenOut.isNative,
              expectedOut: leg2.amountOut,
            },
          ],
        });
      }
    }
  }

  const all = [...singleCandidates, ...crossCandidates];
  if (all.length === 0) return null;
  all.sort((a, b) => (b.amountOut > a.amountOut ? 1 : b.amountOut < a.amountOut ? -1 : 0));
  return all[0];
}

export async function hasAnyLiquidity(
  tokenAddress: string,
  isMainnet: boolean,
): Promise<boolean> {
  const c = getContracts(isMainnet);
  const client = publicClient(isMainnet);
  const candidate = tokenAddress.toLowerCase() as Address;
  const usdt = c.usdtBot.toLowerCase() as Address;
  for (const dex of dexes(isMainnet)) {
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
