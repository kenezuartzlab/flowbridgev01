import { decodeFunctionData, parseAbi, type Address, type Abi, type Hex } from "viem";

/** Observation targets only. These are never spenders or swap execution targets. */
export const POOL_GATE = {
  chainId: 56,
  factory: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
  quoter: "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997",
  router: "0x1b81D678ffb9C0263b24A97847620C99d213eB14",
  pool: "0x83A0A8A723262651Ae9C54BBbA929F167443bC59",
  xaut: "0x21cAef8A43163Eea865baeE23b9C2E327696A3bf",
  usdt: "0x55d398326f99059fF775485246999027B3197955",
  fee: 500, tickSpacing: 10, xautDecimals: 6, usdtDecimals: 18,
} as const;
export const OFFICIAL_RPC = ["https://bsc-dataseed.bnbchain.org", "https://bsc-dataseed1.bnbchain.org"] as const;
export const TEST_USDT_SIZES = [5, 25, 100, 500, 1000] as const;
/** Proposed acceptance limits, not approved execution or economic policy. */
export const PROPOSED_HEALTH = { ttlSeconds: 60, maxBlockAgeSeconds: 30, maxImpactBps: 100, maxRoundTripLossBps: 100, maxTicksCrossed: 10, maxQuoterGas: 1_000_000 } as const;
export const factoryAbi = parseAbi(["function getPool(address tokenA,address tokenB,uint24 fee) view returns (address)"]);
export const poolAbi = parseAbi([
  "function factory() view returns (address)", "function token0() view returns (address)", "function token1() view returns (address)",
  "function fee() view returns (uint24)", "function tickSpacing() view returns (int24)", "function liquidity() view returns (uint128)",
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint32 feeProtocol,bool unlocked)",
]);
export const tokenAbi = parseAbi(["function decimals() view returns (uint8)", "function symbol() view returns (string)", "function totalSupply() view returns (uint256)"]);
// QuoterV2 is deliberately non-view: eth_call simulates and discards all state.
export const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
  "function quoteExactOutputSingle((address tokenIn,address tokenOut,uint256 amount,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountIn,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
]);
export interface PoolIdentity {
  chainId: number; factoryPool: string; factory: string; token0: string; token1: string; fee: number; tickSpacing: number;
  xautDecimals: number; usdtDecimals: number; xautSymbol: string; usdtSymbol: string; liquidity: string; unlocked: boolean;
  codesPresent: boolean; peerAgrees: boolean; blockCanonical: boolean;
}
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
export function identityFailures(p: PoolIdentity): string[] {
  const failures: string[] = [];
  if (p.chainId !== 56) failures.push("chain");
  if (!same(p.factoryPool, POOL_GATE.pool) || !same(p.factory, POOL_GATE.factory)) failures.push("factory-pool");
  if (!same(p.token0, POOL_GATE.xaut) || !same(p.token1, POOL_GATE.usdt)) failures.push("tokens");
  if (p.fee !== 500 || p.tickSpacing !== 10) failures.push("fee-spacing");
  if (p.xautDecimals !== 6 || p.usdtDecimals !== 18 || p.xautSymbol !== "XAUt" || p.usdtSymbol !== "USDT") failures.push("token-metadata");
  if (!/^\d+$/.test(p.liquidity) || BigInt(p.liquidity) <= 0n || !p.unlocked) failures.push("pool-inactive");
  if (!p.codesPresent || !p.peerAgrees || !p.blockCanonical) failures.push("code-peer-canonical");
  return failures;
}
export function quoteFresh(observedAt: string, blockTime: string, nowMs: number): boolean {
  const observed = Date.parse(observedAt), block = Date.parse(blockTime);
  return Number.isFinite(nowMs) && Number.isFinite(observed) && Number.isFinite(block) && nowMs >= observed && nowMs >= block
    && nowMs - observed <= PROPOSED_HEALTH.ttlSeconds * 1000 && nowMs - block <= PROPOSED_HEALTH.maxBlockAgeSeconds * 1000;
}
export interface SizeObservation {
  usdtSize: number; xautInput: string; buyOutput: string; sellOutput: string;
  buyGas: number; sellGas: number; buyTicks: number; sellTicks: number;
  buyImpactBps: number; sellImpactBps: number; roundTripLossBps: number; spreadBps: number;
  exactOutputBuyInput?: string; exactOutputSellInput?: string; error?: string;
}
export function sizeFailures(s: SizeObservation): string[] {
  const failures: string[] = [];
  if (s.error) failures.push("quote-error");
  if (![s.buyImpactBps,s.sellImpactBps,s.roundTripLossBps,s.spreadBps,s.buyGas,s.sellGas,s.buyTicks,s.sellTicks].every(Number.isFinite)
    || ![s.xautInput,s.buyOutput,s.sellOutput].every(v => Number.isFinite(Number(v)) && Number(v) > 0)) failures.push("invalid-quote");
  if (Math.max(s.buyImpactBps,s.sellImpactBps) > PROPOSED_HEALTH.maxImpactBps) failures.push("impact");
  if (s.roundTripLossBps > PROPOSED_HEALTH.maxRoundTripLossBps || s.roundTripLossBps < 0) failures.push("round-trip");
  if (Math.max(s.buyTicks,s.sellTicks) > PROPOSED_HEALTH.maxTicksCrossed) failures.push("concentration");
  if (Math.max(s.buyGas,s.sellGas) > PROPOSED_HEALTH.maxQuoterGas) failures.push("quoter-gas");
  return failures;
}
export function allowedObservationTarget(chainId: number, address: string): address is Address {
  return chainId === 56 && Object.values(POOL_GATE).some(v => typeof v === "string" && same(v,address));
}
export function validateReadOnlyRequest(endpoint: string, method: string, params: unknown[]): void {
  if (!OFFICIAL_RPC.some(u=>u===endpoint) || !["eth_chainId","eth_blockNumber","eth_getBlockByNumber","eth_getCode","eth_call"].includes(method)) throw new Error("Non-read-only RPC forbidden");
  if (method === "eth_getCode" && !allowedObservationTarget(56,String(params[0]))) throw new Error("Unknown target");
  if (method !== "eth_call") return;
  const p = params[0] as {to?: string; data?: Hex} | undefined;
  if (!p?.to || !p.data || !allowedObservationTarget(56,p.to) || Object.keys(p).some(k=>!["to","data"].includes(k))) throw new Error("Unknown call target/fields");
  let abi: Abi | undefined;
  if (same(p.to,POOL_GATE.factory)) abi = factoryAbi;
  if (same(p.to,POOL_GATE.pool)) abi = poolAbi;
  if (same(p.to,POOL_GATE.quoter)) abi = quoterAbi;
  if (same(p.to,POOL_GATE.xaut) || same(p.to,POOL_GATE.usdt)) abi = tokenAbi;
  if (!abi) throw new Error("No router execution permitted");
  const decoded = decodeFunctionData({abi,data:p.data});
  if (same(p.to,POOL_GATE.factory)) {
    const args = decoded.args as readonly [string,string,number];
    if (!same(args[0],POOL_GATE.xaut) || !same(args[1],POOL_GATE.usdt) || Number(args[2]) !== 500) throw new Error("Unknown pool request");
  }
  if (same(p.to,POOL_GATE.quoter)) {
    const args = decoded.args as readonly [{tokenIn: string; tokenOut: string; fee: number; amountIn?: bigint; amount?: bigint; sqrtPriceLimitX96: bigint}];
    const q = args[0];
    const pair = (same(q.tokenIn,POOL_GATE.xaut) && same(q.tokenOut,POOL_GATE.usdt)) || (same(q.tokenIn,POOL_GATE.usdt) && same(q.tokenOut,POOL_GATE.xaut));
    const amount = q.amountIn ?? q.amount ?? 0n;
    const isInput = decoded.functionName === "quoteExactInputSingle";
    const amountToken = isInput ? q.tokenIn : q.tokenOut;
    const max = same(amountToken,POOL_GATE.usdt) ? 1000n * 10n**18n : 1n * 10n**6n;
    if (!pair || Number(q.fee) !== 500 || q.sqrtPriceLimitX96 !== 0n || amount <= 0n || amount > max) throw new Error("Unknown or oversized quote request");
  }
}