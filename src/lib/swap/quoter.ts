// Multi-hop, multi-DEX quoter for BOT Chain.
//
// Router selection is 100% dynamic: we call FlowBridgeRouter v3
// getActiveRouters() on-chain to enumerate the live registry
// (id, name, version, type, address). Nothing is hardcoded — if the
// admin adds/removes a router, this quoter picks it up on the next fetch.
//
//   type 0 = Uniswap V2-style AMM (uses getAmountsOut against a factory)
//   type 1 = Uniswap V3-style pool (currently only the BOT/USDT V3 pool)
//
// CA token has liquidity only on CaSwap. CA ↔ USDT is split:
//   CA → BOT (CaSwap V2) + BOT → USDT (BDex V3) — two transactions.

import { createPublicClient, http, parseAbi, type Address } from "viem";
import { botMainnet, botTestnet } from "@/lib/wagmi";
import {
  getContracts,
  UNISWAP_V2_ROUTER_ABI,
  UNISWAP_V3_POOL_ABI,
  FLOW_BRIDGE_ROUTER_V3_ABI,
} from "@/lib/contracts";
import { NATIVE_TOKEN_ADDRESS, type Token } from "./tokenRegistry";

const FACTORY_ABI = parseAbi([
  "function getPair(address tokenA, address tokenB) view returns (address pair)",
]);

const ZERO = "0x0000000000000000000000000000000000000000" as const;

/** Human-friendly DEX family. Names come from the on-chain registry. */
export type DexId = string;

export interface SwapStep {
  dex: DexId;
  routerId: number;           // FlowBridgeRouter v3 on-chain registry ID
  router: Address;            // underlying DEX router (kept for display)
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
  id: DexId;
  routerId: number;
  factory: Address;
  router: Address;
  wnative: Address;
}

interface ActiveRouter {
  id: number;
  name: string;
  version: string;
  type: number;
  addr: Address;
}

// One shared client per chain. JSON-RPC batching collapses the dozens of
// read calls a route search makes into a handful of HTTP round-trips, which
// is the single biggest win for quote latency on mobile networks.
const CLIENT_CACHE = new Map<string, ReturnType<typeof createPublicClient>>();

function publicClient(isMainnet: boolean) {
  const key = isMainnet ? "main" : "test";
  const existing = CLIENT_CACHE.get(key);
  if (existing) return existing as any;
  const client = createPublicClient({
    chain: isMainnet ? botMainnet : botTestnet,
    transport: http(undefined, { batch: { wait: 16, batchSize: 40 } }),
  });
  CLIENT_CACHE.set(key, client);
  return client as any;
}


// ── Dynamic router registry ──────────────────────────────────────────────
// Cache getActiveRouters() for 5 minutes per chain. Falls back to the known
// mainnet/testnet router addresses in contracts.ts if the call reverts.
const ROUTER_CACHE = new Map<string, { at: number; routers: ActiveRouter[] }>();
const ROUTER_TTL_MS = 5 * 60_000;

async function fetchActiveRouters(isMainnet: boolean): Promise<ActiveRouter[]> {
  const key = isMainnet ? "main" : "test";
  const cached = ROUTER_CACHE.get(key);
  if (cached && Date.now() - cached.at < ROUTER_TTL_MS) return cached.routers;

  const c = getContracts(isMainnet);
  const client = publicClient(isMainnet);
  try {
    const [ids, names, versions, types, addrs] = (await client.readContract({
      address: c.flowBridgeRouterV3.toLowerCase() as Address,
      abi: FLOW_BRIDGE_ROUTER_V3_ABI,
      functionName: "getActiveRouters",
    })) as readonly [readonly bigint[], readonly string[], readonly string[], readonly number[], readonly Address[]];
    const routers: ActiveRouter[] = ids.map((id, i) => ({
      id: Number(id),
      name: names[i],
      version: versions[i],
      type: Number(types[i]),
      addr: addrs[i].toLowerCase() as Address,
    }));
    ROUTER_CACHE.set(key, { at: Date.now(), routers });
    return routers;
  } catch {
    // Fallback: use the addresses baked into contracts.ts. Router IDs match
    // the current on-chain registry (verified via getActiveRouters read).
    const fallback: ActiveRouter[] = [
      { id: 1, name: "BDex V2 (legacy)", version: "2.0", type: 0, addr: c.bdexRouter.toLowerCase() as Address },
      { id: 2, name: "BDex V3", version: "3.0", type: 1, addr: c.bdexRouter.toLowerCase() as Address },
      { id: 3, name: "CaSwapRouter", version: "3.0", type: 0, addr: c.caSwapRouter.toLowerCase() as Address },
      { id: 4, name: "BDex UniswapV2R2", version: "2.2", type: 0, addr: c.bdexV2Router.toLowerCase() as Address },
    ];
    ROUTER_CACHE.set(key, { at: Date.now(), routers: fallback });
    return fallback;
  }
}

/** Expose active routers for UI / diagnostics. */
export async function getActiveRouters(isMainnet: boolean): Promise<ActiveRouter[]> {
  return fetchActiveRouters(isMainnet);
}

const ROUTER_FACTORY_ABI = parseAbi([
  "function factory() view returns (address)",
  "function WETH() view returns (address)",
]);

// Cache factory + wnative per router address (keyed by chain + router).
const ROUTER_META_CACHE = new Map<string, { factory: Address; wnative: Address }>();

async function resolveRouterMeta(
  client: ReturnType<typeof publicClient>,
  router: Address,
  chainKey: string,
  fallback: { factory: Address; wnative: Address },
): Promise<{ factory: Address; wnative: Address }> {
  const key = `${chainKey}:${router}`;
  const cached = ROUTER_META_CACHE.get(key);
  if (cached) return cached;
  let factory = fallback.factory;
  let wnative = fallback.wnative;
  try {
    const f = (await client.readContract({
      address: router,
      abi: ROUTER_FACTORY_ABI,
      functionName: "factory",
    })) as Address;
    if (f && f !== ZERO) factory = f.toLowerCase() as Address;
  } catch { /* keep fallback */ }
  try {
    const w = (await client.readContract({
      address: router,
      abi: ROUTER_FACTORY_ABI,
      functionName: "WETH",
    })) as Address;
    if (w && w !== ZERO) wnative = w.toLowerCase() as Address;
  } catch { /* keep fallback */ }
  const meta = { factory, wnative };
  ROUTER_META_CACHE.set(key, meta);
  return meta;
}

async function v2Dexes(isMainnet: boolean): Promise<DexCfg[]> {
  const c = getContracts(isMainnet);
  const wbot = c.wbot.toLowerCase() as Address;
  const caWbot = c.caWbot.toLowerCase() as Address;
  const bdexFactory = c.bdexFactory.toLowerCase() as Address;
  const caSwapFactory = c.caSwapFactory.toLowerCase() as Address;
  const caSwapRouter = c.caSwapRouter.toLowerCase() as Address;
  const chainKey = isMainnet ? "main" : "test";
  const client = publicClient(isMainnet);

  const routers = await fetchActiveRouters(isMainnet);
  const v2 = routers.filter((r) => r.type === 0);

  const cfgs = await Promise.all(
    v2.map(async (r) => {
      const isCaSwap = r.addr === caSwapRouter;
      // Heuristic fallback: caSwap router → caSwap factory/caWBOT; else BDex family.
      const fallback = {
        factory: isCaSwap ? caSwapFactory : bdexFactory,
        wnative: isCaSwap ? caWbot : wbot,
      };
      // Ask the router itself which factory + wrapped-native it uses.
      const meta = await resolveRouterMeta(client, r.addr, chainKey, fallback);
      return {
        id: isCaSwap ? "caswap" : (r.name || `router-${r.id}`).toLowerCase(),
        routerId: r.id,
        factory: meta.factory,
        router: r.addr,
        wnative: meta.wnative,
      } as DexCfg;
    }),
  );
  return cfgs;
}

// Router ID for BDex V3 on-chain. Read from the active registry so it is
// never stale — falls back to 2 (the current mainnet id) if unavailable.
async function bdexV3RouterId(isMainnet: boolean): Promise<number> {
  const routers = await fetchActiveRouters(isMainnet);
  const v3 = routers.find((r) => r.type === 1);
  return v3 ? v3.id : 2;
}


// Pair existence never flips back to "missing", and new pairs are rare, so we
// memoise the lookups for the lifetime of the tab. Positive results are cached
// forever; negatives are re-checked after 2 minutes so newly created pools are
// picked up without hammering the RPC on every keystroke.
const PAIR_CACHE = new Map<string, { exists: boolean; at: number }>();
const PAIR_NEGATIVE_TTL_MS = 120_000;

async function pairExists(
  client: ReturnType<typeof publicClient>,
  factory: Address,
  a: Address,
  b: Address,
): Promise<boolean> {
  const key = `${factory}:${a}:${b}`;
  const cached = PAIR_CACHE.get(key);
  if (cached && (cached.exists || Date.now() - cached.at < PAIR_NEGATIVE_TTL_MS)) {
    return cached.exists;
  }
  try {
    const pair = (await client.readContract({
      address: factory,
      abi: FACTORY_ABI,
      functionName: "getPair",
      args: [a, b],
    })) as Address;
    const exists = pair.toLowerCase() !== ZERO;
    PAIR_CACHE.set(key, { exists, at: Date.now() });
    return exists;
  } catch {
    PAIR_CACHE.set(key, { exists: false, at: Date.now() });
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
    routerId: await bdexV3RouterId(isMainnet),
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

// Best single-DEX V2 quote. Tries direct + hop through every base in `hops`
// (wrapped native, USDT, CA, and any imported tokens). Only paths where both
// pairs exist on the router's factory are quoted, so extra hops are cheap.
async function bestOnV2Dex(
  client: ReturnType<typeof publicClient>,
  dex: DexCfg,
  hops: { addr: Address; symbol: string }[],
  tokenIn: Token,
  tokenOut: Token,
  amountIn: bigint,
): Promise<{ amountOut: bigint; path: Address[]; symbolPath: string[] } | null> {
  const inA = addrFor(tokenIn, dex);
  const outA = addrFor(tokenOut, dex);
  if (inA === outA) return null;

  // De-dupe hop addresses; skip hops that equal the endpoints.
  const hopList: { addr: Address; symbol: string }[] = [];
  const seen = new Set<string>();
  for (const hop of hops) {
    const h = hop.addr.toLowerCase() as Address;
    if (h === inA || h === outA || seen.has(h)) continue;
    seen.add(h);
    hopList.push({ addr: h, symbol: hop.symbol });
  }

  // All pair lookups fire together (and are cached), instead of one RPC
  // round-trip at a time.
  const [direct, ...hopChecks] = await Promise.all([
    pairExists(client, dex.factory, inA, outA),
    ...hopList.map(async (hop) => {
      const [a, b] = await Promise.all([
        pairExists(client, dex.factory, inA, hop.addr),
        pairExists(client, dex.factory, hop.addr, outA),
      ]);
      return a && b;
    }),
  ]);

  const candidates: { path: Address[]; symbolPath: string[] }[] = [];
  if (direct) {
    candidates.push({ path: [inA, outA], symbolPath: [tokenIn.symbol, tokenOut.symbol] });
  }
  hopList.forEach((hop, i) => {
    if (!hopChecks[i]) return;
    // Display symbol: wrapped-native shows as "BOT".
    const hopSym = hop.addr === dex.wnative ? "BOT" : hop.symbol;
    candidates.push({
      path: [inA, hop.addr, outA],
      symbolPath: [tokenIn.symbol, hopSym, tokenOut.symbol],
    });
  });

  const outs = await Promise.all(
    candidates.map((c) => getAmountsOut(client, dex.router, amountIn, c.path)),
  );

  let best: { amountOut: bigint; path: Address[]; symbolPath: string[] } | null = null;
  candidates.forEach((c, i) => {
    const out = outs[i];
    if (out !== null && out > 0n && (!best || out > best.amountOut)) {
      best = { amountOut: out, path: c.path, symbolPath: c.symbolPath };
    }
  });
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
  const caWbot = c.caWbot.toLowerCase() as Address;
  const usdt = c.usdtBot.toLowerCase() as Address;
  const caToken = c.caToken.toLowerCase() as Address;
  const client = publicClient(isMainnet);
  const allV2 = await v2Dexes(isMainnet);

  // Hop bases considered on every V2 route: wrapped-natives, USDT, CA, plus
  // any user-imported tokens. `bestOnV2Dex` filters out hops that don't have
  // a live pair on the router's factory, so extra entries are safe.
  let importedHops: { addr: Address; symbol: string }[] = [];
  try {
    // Dynamic import so SSR/edge builds without localStorage don't crash.
    const mod = await import("./tokenRegistry");
    importedHops = mod.getImportedTokens(isMainnet).map((t) => ({
      addr: t.address.toLowerCase() as Address,
      symbol: t.symbol,
    }));
  } catch { /* no localStorage or module missing — skip */ }
  const hopBases: { addr: Address; symbol: string }[] = [
    { addr: wbot, symbol: "BOT" },
    { addr: caWbot, symbol: "BOT" },
    { addr: usdt, symbol: "USDT" },
    { addr: caToken, symbol: "CA" },
    ...importedHops,
  ];

  const candidates: QuoteResult[] = [];

  const tokenInIsUsdt =
    !tokenIn.isNative && tokenIn.address.toLowerCase() === usdt;
  const tokenOutIsUsdt =
    !tokenOut.isNative && tokenOut.address.toLowerCase() === usdt;
  const usdtToken = USDT_TOKEN(isMainnet);

  const needsLegOne =
    (!tokenIn.isNative && !tokenOut.isNative) ||
    (tokenOutIsUsdt && !tokenIn.isNative && tokenIn.address.toLowerCase() !== usdt);

  // ── Phase A: everything that only depends on `amountIn` runs together ──
  const [v3, singleDex, legOnes] = await Promise.all([
    // 1. Direct BOT↔USDT via BDex V3
    botUsdtStep(client, isMainnet, tokenIn, tokenOut, amountIn),
    // 2. Single-DEX V2 routes — one probe per active router, in parallel
    Promise.all(
      allV2.map((dex) => bestOnV2Dex(client, dex, hopBases, tokenIn, tokenOut, amountIn)),
    ),
    // tokenIn → BOT on each V2 dex (shared by the split-route sections below)
    needsLegOne
      ? Promise.all(
          allV2.map((dex) => bestOnV2Dex(client, dex, hopBases, tokenIn, NATIVE_BOT, amountIn)),
        )
      : Promise.resolve([] as (Awaited<ReturnType<typeof bestOnV2Dex>>)[]),
  ]);

  if (v3) {
    candidates.push({
      amountOut: v3.expectedOut,
      path: v3.path,
      symbolPath: v3.symbolPath,
      steps: [v3],
    });
  }

  allV2.forEach((dex, i) => {
    const r = singleDex[i];
    if (!r) return;
    candidates.push({
      amountOut: r.amountOut,
      path: r.path,
      symbolPath: r.symbolPath,
      steps: [
        {
          dex: dex.id,
          routerId: dex.routerId,
          router: dex.router,
          path: r.path,
          symbolPath: r.symbolPath,
          inIsNative: !!tokenIn.isNative,
          outIsNative: !!tokenOut.isNative,
          expectedOut: r.amountOut,
        },
      ],
    });
  });

  // ── Phase B: split routes, all second legs issued concurrently ─────────
  // 3. Cross-DEX split via native BOT (V2 ↔ V2)
  if (!(tokenIn.isNative || tokenOut.isNative)) {
    const pairs: { a: number; b: number }[] = [];
    allV2.forEach((_, a) =>
      allV2.forEach((_, b) => {
        if (allV2[a].routerId !== allV2[b].routerId && legOnes[a]) pairs.push({ a, b });
      }),
    );
    const legTwos = await Promise.all(
      pairs.map(({ a, b }) =>
        bestOnV2Dex(client, allV2[b], hopBases, NATIVE_BOT, tokenOut, legOnes[a]!.amountOut),
      ),
    );
    pairs.forEach(({ a, b }, i) => {
      const leg1 = legOnes[a]!;
      const leg2 = legTwos[i];
      if (!leg2) return;
      const dexA = allV2[a];
      const dexB = allV2[b];
      candidates.push({
        amountOut: leg2.amountOut,
        path: leg1.path,
        symbolPath: [...leg1.symbolPath, ...leg2.symbolPath.slice(1)],
        steps: [
          {
            dex: dexA.id,
            routerId: dexA.routerId,
            router: dexA.router,
            path: leg1.path,
            symbolPath: leg1.symbolPath,
            inIsNative: !!tokenIn.isNative,
            outIsNative: true,
            expectedOut: leg1.amountOut,
          },
          {
            dex: dexB.id,
            routerId: dexB.routerId,
            router: dexB.router,
            path: leg2.path,
            symbolPath: leg2.symbolPath,
            inIsNative: true,
            outIsNative: !!tokenOut.isNative,
            expectedOut: leg2.amountOut,
          },
        ],
      });
    });
  }

  // ── 4. Split via BOT where one side is USDT (uses V3 for BOT↔USDT) ─────
  //   e.g. CA → USDT  :  CA → BOT (CaSwap V2)  +  BOT → USDT (BDex V3)
  //        USDT → CA  :  USDT → BOT (BDex V3)  +  BOT → CA (CaSwap V2)
  if (tokenOutIsUsdt && !tokenIn.isNative && tokenIn.address.toLowerCase() !== usdt) {
    // tokenIn → BOT on each V2 dex (already fetched), then BOT → USDT via V3
    const legTwos = await Promise.all(
      allV2.map((_, i) =>
        legOnes[i]
          ? botUsdtStep(client, isMainnet, NATIVE_BOT, usdtToken, legOnes[i]!.amountOut)
          : Promise.resolve(null),
      ),
    );
    allV2.forEach((dexA, i) => {
      const leg1 = legOnes[i];
      const leg2 = legTwos[i];
      if (!leg1 || !leg2) return;
      candidates.push({
        amountOut: leg2.expectedOut,
        path: leg1.path,
        symbolPath: [...leg1.symbolPath, "USDT"],
        steps: [
          {
            dex: dexA.id,
            routerId: dexA.routerId,
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
    });
  }


  if (tokenInIsUsdt && !tokenOut.isNative && tokenOut.address.toLowerCase() !== usdt) {
    // USDT → BOT via V3, then BOT → tokenOut on each V2 dex
    const leg1 = await botUsdtStep(client, isMainnet, usdtToken, NATIVE_BOT, amountIn);
    if (leg1) {
      for (const dexB of allV2) {
        const leg2 = await bestOnV2Dex(client, dexB, hopBases, NATIVE_BOT, tokenOut, leg1.expectedOut);
        if (!leg2) continue;
        candidates.push({
          amountOut: leg2.amountOut,
          path: leg1.path,
          symbolPath: ["USDT", ...leg2.symbolPath],
          steps: [
            leg1,
            {
              dex: dexB.id,
              routerId: dexB.routerId,
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

/**
 * Deep liquidity probe for custom-imported tokens.
 * Uses the full router (getBestRoute) with a small probe amount, testing the
 * token against every base (BOT native, USDT, CA). If any router/DEX in the
 * registry yields a positive quote, the token is tradable — no manual pair
 * address needed.
 */
export async function hasAnyLiquidity(
  tokenAddress: string,
  isMainnet: boolean,
): Promise<boolean> {
  const c = getContracts(isMainnet);
  const candidateAddr = tokenAddress.toLowerCase();

  const bases = [
    c.wbot.toLowerCase(),
    c.caWbot.toLowerCase(),
    c.usdtBot.toLowerCase(),
    c.caToken.toLowerCase(),
  ];
  if (bases.includes(candidateAddr)) return true;

  let decimals = 18;
  try {
    const client = publicClient(isMainnet);
    const ERC20_DEC = parseAbi(["function decimals() view returns (uint8)"]);
    decimals = Number(
      await client.readContract({
        address: candidateAddr as Address,
        abi: ERC20_DEC,
        functionName: "decimals",
      }),
    );
  } catch {
    /* keep 18 */
  }
  const probeAmount = 10n ** BigInt(decimals);

  const candidateIn: Token = {
    address: candidateAddr,
    symbol: "T",
    name: "T",
    decimals,
  };

  const targets: Token[] = [
    NATIVE_BOT,
    USDT_TOKEN(isMainnet),
    { address: c.caToken.toLowerCase(), symbol: "CA", name: "CaryPact", decimals: 18 },
  ];

  for (const out of targets) {
    if (out.address.toLowerCase() === candidateAddr) continue;
    try {
      const r = await getBestRoute(candidateIn, out, probeAmount, isMainnet);
      if (r && r.amountOut > 0n) return true;
    } catch { /* try next */ }
    try {
      const r = await getBestRoute(out, candidateIn, probeAmount, isMainnet);
      if (r && r.amountOut > 0n) return true;
    } catch { /* try next */ }
  }
  return false;
}

export { NATIVE_TOKEN_ADDRESS };
