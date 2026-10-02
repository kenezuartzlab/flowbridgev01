/** Liquidity V1 — read-only on-chain discovery (pairs, LP balances, V3 positions, fees). */
import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { botMainnet, botTestnet } from "@/lib/wagmi";
import { ERC20_LITE_ABI, MAX_UINT128, NPM_ABI, V2_FACTORY_ABI, V2_PAIR_ABI, V2_ROUTER_ABI, V3_FACTORY_ABI, V3_POOL_ABI } from "./abis";
import type { V2Venue, V3Venue } from "./venues";
import { rangeStatus, type RangeStatus } from "./v3Math";

const ZERO = "0x0000000000000000000000000000000000000000";
const clients = new Map<number, PublicClient>();
export function liqClient(chainId: number): PublicClient {
  let c = clients.get(chainId);
  if (!c) {
    c = createPublicClient({ chain: chainId === 677 ? botMainnet : botTestnet, transport: http(undefined, { batch: true }) }) as PublicClient;
    clients.set(chainId, c);
  }
  return c;
}

export interface TokenMeta { address: Address; symbol: string; decimals: number }
const metaCache = new Map<string, TokenMeta>();
export async function tokenMeta(chainId: number, address: Address): Promise<TokenMeta> {
  const k = `${chainId}:${address.toLowerCase()}`;
  const hit = metaCache.get(k);
  if (hit) return hit;
  const c = liqClient(chainId);
  const [symbol, decimals] = await Promise.all([
    c.readContract({ address, abi: ERC20_LITE_ABI, functionName: "symbol" }).catch(() => "?"),
    c.readContract({ address, abi: ERC20_LITE_ABI, functionName: "decimals" }),
  ]);
  const m = { address, symbol: String(symbol), decimals: Number(decimals) };
  metaCache.set(k, m);
  return m;
}

export async function v2Wiring(v: V2Venue): Promise<{ factory: Address; wrapped: Address }> {
  const c = liqClient(v.chainId);
  const [factory, wrapped] = await Promise.all([
    c.readContract({ address: v.router, abi: V2_ROUTER_ABI, functionName: "factory" }),
    c.readContract({ address: v.router, abi: V2_ROUTER_ABI, functionName: v.wrappedGetter }),
  ]);
  return { factory, wrapped };
}

export interface V2PairState {
  pair: Address | null;
  token0: Address;
  token1: Address;
  reserve0: bigint;
  reserve1: bigint;
  totalSupply: bigint;
}

export async function readV2Pair(v: V2Venue, a: Address, b: Address): Promise<V2PairState | null> {
  const c = liqClient(v.chainId);
  const { factory } = await v2Wiring(v);
  const pair = await c.readContract({ address: factory, abi: V2_FACTORY_ABI, functionName: "getPair", args: [a, b] });
  if (!pair || pair === ZERO) return null;
  const [t0, t1, r, ts] = await Promise.all([
    c.readContract({ address: pair, abi: V2_PAIR_ABI, functionName: "token0" }),
    c.readContract({ address: pair, abi: V2_PAIR_ABI, functionName: "token1" }),
    c.readContract({ address: pair, abi: V2_PAIR_ABI, functionName: "getReserves" }),
    c.readContract({ address: pair, abi: V2_PAIR_ABI, functionName: "totalSupply" }),
  ]);
  return { pair, token0: t0, token1: t1, reserve0: r[0], reserve1: r[1], totalSupply: ts };
}

export interface V2Position {
  venue: V2Venue["id"];
  chainId: number;
  pair: Address;
  token0: TokenMeta;
  token1: TokenMeta;
  lpBalance: bigint;
  totalSupply: bigint;
  amount0: bigint;
  amount1: bigint;
  shareBps: number;
}

/** LP discovery: scans the venue's own factory (capped) for pairs the wallet holds. */
export async function discoverV2Positions(v: V2Venue, owner: Address, cap = 600): Promise<V2Position[]> {
  const c = liqClient(v.chainId);
  const { factory } = await v2Wiring(v);
  const n = Number(await c.readContract({ address: factory, abi: V2_FACTORY_ABI, functionName: "allPairsLength" }));
  const total = Math.min(n, cap);
  const out: V2Position[] = [];
  for (let start = 0; start < total; start += 50) {
    const idx = Array.from({ length: Math.min(50, total - start) }, (_, i) => BigInt(start + i));
    const pairs = await Promise.all(idx.map((i) => c.readContract({ address: factory, abi: V2_FACTORY_ABI, functionName: "allPairs", args: [i] })));
    const bals = await Promise.all(pairs.map((p) => c.readContract({ address: p, abi: V2_PAIR_ABI, functionName: "balanceOf", args: [owner] }).catch(() => 0n)));
    for (let i = 0; i < pairs.length; i++) {
      if (bals[i] === 0n) continue;
      const p = pairs[i];
      const [t0, t1, r, ts] = await Promise.all([
        c.readContract({ address: p, abi: V2_PAIR_ABI, functionName: "token0" }),
        c.readContract({ address: p, abi: V2_PAIR_ABI, functionName: "token1" }),
        c.readContract({ address: p, abi: V2_PAIR_ABI, functionName: "getReserves" }),
        c.readContract({ address: p, abi: V2_PAIR_ABI, functionName: "totalSupply" }),
      ]);
      const [m0, m1] = await Promise.all([tokenMeta(v.chainId, t0), tokenMeta(v.chainId, t1)]);
      out.push({
        venue: v.id, chainId: v.chainId, pair: p, token0: m0, token1: m1, lpBalance: bals[i], totalSupply: ts,
        amount0: ts ? (bals[i] * r[0]) / ts : 0n, amount1: ts ? (bals[i] * r[1]) / ts : 0n,
        shareBps: ts ? Number((bals[i] * 10_000n) / ts) : 0,
      });
    }
  }
  return out;
}

export async function enabledFeeTiers(v: V3Venue): Promise<{ fee: number; tickSpacing: number }[]> {
  const c = liqClient(v.chainId);
  const tiers = [100, 500, 3000, 10000];
  const sp = await Promise.all(tiers.map((f) => c.readContract({ address: v.factory, abi: V3_FACTORY_ABI, functionName: "feeAmountTickSpacing", args: [f] }).catch(() => 0)));
  return tiers.map((fee, i) => ({ fee, tickSpacing: Number(sp[i]) })).filter((t) => t.tickSpacing > 0);
}

export interface V3PoolState { pool: Address | null; sqrtPriceX96: bigint; tick: number; liquidity: bigint; tickSpacing: number }

export async function readV3Pool(v: V3Venue, a: Address, b: Address, fee: number): Promise<V3PoolState> {
  const c = liqClient(v.chainId);
  const pool = await c.readContract({ address: v.factory, abi: V3_FACTORY_ABI, functionName: "getPool", args: [a, b, fee] });
  if (!pool || pool === ZERO) return { pool: null, sqrtPriceX96: 0n, tick: 0, liquidity: 0n, tickSpacing: 0 };
  const [s0, L, ts] = await Promise.all([
    c.readContract({ address: pool, abi: V3_POOL_ABI, functionName: "slot0" }),
    c.readContract({ address: pool, abi: V3_POOL_ABI, functionName: "liquidity" }),
    c.readContract({ address: pool, abi: V3_POOL_ABI, functionName: "tickSpacing" }),
  ]);
  return { pool, sqrtPriceX96: s0[0], tick: Number(s0[1]), liquidity: L, tickSpacing: Number(ts) };
}

export interface V3Position {
  tokenId: bigint;
  chainId: number;
  token0: TokenMeta;
  token1: TokenMeta;
  fee: number;
  liquidity: bigint;
  tickLower: number;
  tickUpper: number;
  currentTick: number | null;
  sqrtPriceX96: bigint;
  pool: Address | null;
  status: RangeStatus;
  /** From a static `collect` simulation; null when it could not be read reliably. */
  unclaimed0: bigint | null;
  unclaimed1: bigint | null;
}

export async function unclaimedFees(v: V3Venue, tokenId: bigint, owner: Address): Promise<{ a0: bigint; a1: bigint } | null> {
  try {
    const { result } = await liqClient(v.chainId).simulateContract({
      address: v.positionManager, abi: NPM_ABI, functionName: "collect", account: owner,
      args: [{ tokenId, recipient: owner, amount0Max: MAX_UINT128, amount1Max: MAX_UINT128 }],
    });
    return { a0: result[0], a1: result[1] };
  } catch {
    return null;
  }
}

export async function discoverV3Positions(v: V3Venue, owner: Address, cap = 100): Promise<V3Position[]> {
  const c = liqClient(v.chainId);
  const n = Number(await c.readContract({ address: v.positionManager, abi: NPM_ABI, functionName: "balanceOf", args: [owner] }));
  const ids = await Promise.all(Array.from({ length: Math.min(n, cap) }, (_, i) =>
    c.readContract({ address: v.positionManager, abi: NPM_ABI, functionName: "tokenOfOwnerByIndex", args: [owner, BigInt(i)] })));
  return Promise.all(ids.map(async (tokenId) => {
    const p = await c.readContract({ address: v.positionManager, abi: NPM_ABI, functionName: "positions", args: [tokenId] });
    const [, , t0, t1, fee, tl, tu, liq] = p;
    const [m0, m1, pool, fees] = await Promise.all([
      tokenMeta(v.chainId, t0), tokenMeta(v.chainId, t1), readV3Pool(v, t0, t1, Number(fee)), unclaimedFees(v, tokenId, owner),
    ]);
    return {
      tokenId, chainId: v.chainId, token0: m0, token1: m1, fee: Number(fee), liquidity: liq,
      tickLower: Number(tl), tickUpper: Number(tu), currentTick: pool.pool ? pool.tick : null,
      sqrtPriceX96: pool.sqrtPriceX96, pool: pool.pool,
      status: pool.pool ? rangeStatus(pool.tick, Number(tl), Number(tu), liq) : "closed",
      unclaimed0: fees ? fees.a0 : null, unclaimed1: fees ? fees.a1 : null,
    };
  }));
}

export async function readAllowance(chainId: number, token: Address, owner: Address, spender: Address): Promise<bigint> {
  return liqClient(chainId).readContract({ address: token, abi: ERC20_LITE_ABI, functionName: "allowance", args: [owner, spender] });
}

export async function readBalance(chainId: number, token: Address | "native", owner: Address): Promise<bigint> {
  const c = liqClient(chainId);
  if (token === "native") return c.getBalance({ address: owner });
  return c.readContract({ address: token, abi: ERC20_LITE_ABI, functionName: "balanceOf", args: [owner] });
}
