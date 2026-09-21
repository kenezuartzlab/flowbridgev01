/**
 * V30.2B P4A.2 — on-chain protection reference for the live FLOW/USDT pool.
 *
 * Reads the exact BDEX V3 pool discovered from the verified factory and derives
 * the 30-minute (fast protection) and 6-hour (regime confirmation) TWAPs from
 * cumulative tick observations. Fully read-only.
 *
 * Fail-closed rules:
 *  - The pool must be resolved from the factory; nothing is hardcoded.
 *  - A window is only usable when the observation ring buffer holds more than
 *    one observation AND real history covers the whole window. Single-observation
 *    extrapolation is the launch price, not an observed average, and is rejected.
 *  - Any read error, malformed value, or short window → `failed` / `warmup`.
 *  - No browser/API/manual/AI price is ever substituted.
 */
import { createPublicClient, http, type Address } from "viem";
import { botMainnet } from "@/lib/wagmi";
import { getContracts, UNISWAP_V3_FACTORY_ABI, UNISWAP_V3_POOL_ABI } from "@/lib/contracts";
import {
  FAST_TWAP_SECONDS,
  REGIME_TWAP_SECONDS,
  type ReferenceState,
} from "./routeGuard";

export const FLOW_USDT_FEE_TIER = 10000;

const ZERO = "0x0000000000000000000000000000000000000000";

const POOL_OBSERVE_ABI = [
  {
    type: "function",
    name: "observe",
    stateMutability: "view",
    inputs: [{ name: "secondsAgos", type: "uint32[]" }],
    outputs: [
      { name: "tickCumulatives", type: "int56[]" },
      { name: "secondsPerLiquidityCumulativeX128", type: "uint160[]" },
    ],
  },
  {
    type: "function",
    name: "observations",
    stateMutability: "view",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [
      { name: "blockTimestamp", type: "uint32" },
      { name: "tickCumulative", type: "int56" },
      { name: "secondsPerLiquidityCumulativeX128", type: "uint160" },
      { name: "initialized", type: "bool" },
    ],
  },
] as const;

export interface PoolReference {
  pool: Address | null;
  /** Active in-range liquidity present and pool initialised + unlocked. */
  poolActive: boolean;
  /** True when canonical FLOW is token1 of the reference pool. */
  flowIsToken1: boolean | null;
  fee: number | null;
  currentTick: number | null;
  observationCardinality: number;
  historySeconds: number;
  /** Average tick over each window, when genuinely available. */
  fastTwapTick: number | null;
  regimeTwapTick: number | null;
  /** |live vs 30m TWAP| in bps — the breaker input. */
  deviationBps: number | null;
  referenceState: ReferenceState;
  /** Earliest unix second at which a genuine 7-day lookback becomes possible. */
  earliest7dTwapAt: number | null;
  detail: string;
}

function client() {
  return createPublicClient({ chain: botMainnet, transport: http() });
}

/** bps difference between two ticks (1.0001^tickDelta). */
export function tickDeviationBps(liveTick: number, referenceTick: number): number {
  const ratio = Math.pow(1.0001, liveTick - referenceTick);
  return Math.round(Math.abs(ratio - 1) * 10_000);
}

export const FLOW_DECIMALS = 18;
export const USDT_DECIMALS = 6;

/**
 * Human FLOW per 1 human USDT implied by a pool tick.
 * A V3 tick encodes raw token1/token0, so the decimal difference is applied
 * explicitly and the ratio is inverted when FLOW is token0.
 */
export function referenceFlowPerUsdt(tick: number, flowIsToken1: boolean): number {
  const raw = Math.pow(1.0001, tick);
  const scale = Math.pow(10, USDT_DECIMALS - FLOW_DECIMALS); // 1e-12
  return flowIsToken1 ? raw * scale : 1 / (raw / scale);
}

/**
 * |route-effective execution price vs protection reference| in bps, derived
 * only from the final quoted input/output of the whole route. Works for any
 * number of hops, because it never inspects the path.
 */
export function effectiveTradeDeviationBps(args: {
  amountIn: bigint;
  amountOut: bigint;
  tokenInIsFlow: boolean;
  referenceTick: number;
  flowIsToken1: boolean;
}): number | null {
  const { amountIn, amountOut, tokenInIsFlow, referenceTick, flowIsToken1 } = args;
  if (amountIn <= 0n || amountOut <= 0n) return null;
  const inDec = tokenInIsFlow ? FLOW_DECIMALS : USDT_DECIMALS;
  const outDec = tokenInIsFlow ? USDT_DECIMALS : FLOW_DECIMALS;
  const inHuman = Number(amountIn) / Math.pow(10, inDec);
  const outHuman = Number(amountOut) / Math.pow(10, outDec);
  if (!Number.isFinite(inHuman) || !Number.isFinite(outHuman) || inHuman <= 0 || outHuman <= 0) return null;
  const effectiveFlowPerUsdt = tokenInIsFlow ? inHuman / outHuman : outHuman / inHuman;
  const reference = referenceFlowPerUsdt(referenceTick, flowIsToken1);
  if (!Number.isFinite(reference) || reference <= 0) return null;
  return Math.round(Math.abs(effectiveFlowPerUsdt / reference - 1) * 10_000);
}

export async function readFlowUsdtReference(isMainnet = true): Promise<PoolReference> {
  const empty: PoolReference = {
    pool: null,
    poolActive: false,
    flowIsToken1: null,
    fee: null,
    currentTick: null,
    observationCardinality: 0,
    historySeconds: 0,
    fastTwapTick: null,
    regimeTwapTick: null,
    deviationBps: null,
    referenceState: "failed",
    earliest7dTwapAt: null,
    detail: "Protection reference could not be read.",
  };
  if (!isMainnet) return { ...empty, detail: "FLOW/USDT route exists on BOT Mainnet only." };

  const c = getContracts(isMainnet);
  const factory = c.bdexV3Factory.toLowerCase() as Address;
  const flow = c.flowToken.toLowerCase() as Address;
  const usdt = c.usdtBot.toLowerCase() as Address;
  if (factory === ZERO || flow === ZERO) return empty;

  const pub = client();
  try {
    const pool = (await pub.readContract({
      address: factory,
      abi: UNISWAP_V3_FACTORY_ABI,
      functionName: "getPool",
      args: [flow, usdt, FLOW_USDT_FEE_TIER],
    })) as Address;
    if (pool.toLowerCase() === ZERO) {
      return { ...empty, detail: "No live FLOW/USDT 1% pool on the verified factory." };
    }

    const [fee, liquidity, slot0, oldest, block, token1] = await Promise.all([
      pub.readContract({ address: pool, abi: UNISWAP_V3_POOL_ABI, functionName: "fee" }) as Promise<number>,
      pub.readContract({ address: pool, abi: UNISWAP_V3_POOL_ABI, functionName: "liquidity" }) as Promise<bigint>,
      pub.readContract({ address: pool, abi: UNISWAP_V3_POOL_ABI, functionName: "slot0" }) as Promise<
        readonly [bigint, number, number, number, number, number, boolean]
      >,
      pub.readContract({ address: pool, abi: POOL_OBSERVE_ABI, functionName: "observations", args: [0n] }) as Promise<
        readonly [number, bigint, bigint, boolean]
      >,
      pub.getBlock(),
      pub.readContract({ address: pool, abi: UNISWAP_V3_POOL_ABI, functionName: "token1" }) as Promise<Address>,
    ]);

    const poolActive = liquidity > 0n && slot0[0] > 0n && slot0[6] === true;
    const cardinality = Number(slot0[3]);
    const now = Number(block.timestamp);
    const oldestTs = Number(oldest[0]);
    const historySeconds = oldest[3] ? Math.max(0, now - oldestTs) : 0;
    const base: PoolReference = {
      ...empty,
      pool,
      poolActive,
      flowIsToken1: token1.toLowerCase() === flow,
      fee: Number(fee),
      currentTick: Number(slot0[1]),
      observationCardinality: cardinality,
      historySeconds,
      earliest7dTwapAt: oldest[3] ? oldestTs + 604_800 : null,
      referenceState: "warmup",
      detail: "",
    };

    if (Number(fee) !== FLOW_USDT_FEE_TIER) {
      return { ...base, referenceState: "failed", detail: "Pool fee tier mismatch." };
    }
    if (cardinality <= 1) {
      return {
        ...base,
        referenceState: "warmup",
        detail: "Price history is still warming up — normal protection with live quote checks.",
      };
    }

    const twapTick = async (seconds: number): Promise<number | null> => {
      if (historySeconds < seconds) return null;
      try {
        const res = (await pub.readContract({
          address: pool,
          abi: POOL_OBSERVE_ABI,
          functionName: "observe",
          args: [[seconds, 0]],
        })) as readonly [readonly bigint[], readonly bigint[]];
        const [a, b] = res[0];
        if (a === undefined || b === undefined) return null;
        return Number((b - a) / BigInt(seconds));
      } catch {
        return null;
      }
    };

    const [fast, regime] = await Promise.all([
      twapTick(FAST_TWAP_SECONDS),
      twapTick(REGIME_TWAP_SECONDS),
    ]);

    if (fast === null || !Number.isFinite(fast)) {
      return {
        ...base,
        regimeTwapTick: regime,
        referenceState: "warmup",
        detail: "30-minute history is not complete yet — normal protection with live quote checks.",
      };
    }

    return {
      ...base,
      fastTwapTick: fast,
      regimeTwapTick: regime,
      deviationBps: tickDeviationBps(Number(slot0[1]), fast),
      referenceState: "ready",
      detail: "Live price compared against the 30-minute on-chain average.",
    };
  } catch {
    return empty;
  }
}
