// Fresh registered-route quotes for AutoTrade. BDEX V3 is executable only after
// registry, identity, wrapper, fee, pool and liquidity checks. Alternative CaSwap
// is always diagnostic-only and can never supply a paper fill or calldata.
import { createPublicClient, http, keccak256, parseAbi, type Address, type Hex } from "viem";
import { MAINNET_CONTRACTS as M } from "@/lib/contracts";
import { quoteAlternativeCaSwap } from "@/lib/swap/caswapQuote";
import {
  CA_WBOT_BDEX_V3_POOL,
  assertRouteExecutable,
  selectBestExecutableRoute,
  type ComparedRoute,
} from "@/lib/swap/routeComparison";
import { ROUTER_V4, ROUTER_V4_BDEX_V3_ID, ROUTER_V4_FEE_BPS_BDEX_V3, type AutoTradePair } from "./config";
import type { Quote } from "./engine";
import { ROUTER_V4_RUNTIME_KECCAK } from "./executor";
import { encodePath, legPath, legTokens } from "./path";

const QUOTER = M.bdexV3Quoter.toLowerCase() as Hex;
const abi = parseAbi([
  "function quoteExactInput(bytes path,uint256 amountIn) returns (uint256,uint160[],uint32[],uint256)",
  "function routers(uint256) view returns (address,uint8,address,bool,string,string)",
  "function routerCount() view returns (uint256)",
  "function routerFeeBps(uint256) view returns (uint256)",
  "function paused() view returns (bool)",
  "function getPool(address,address,uint24) view returns (address)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
  "function liquidity() view returns (uint128)",
  "function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)",
]);
export { encodePath, legPath };

export async function quoteLeg(p: AutoTradePair, side: "buy" | "sell", amountIn: bigint): Promise<Quote> {
  const primary = createPublicClient({ transport: http("https://rpc.botchain.ai", { timeout: 8_000 }) });
  const sec = process.env["AUTOTRADE_SECONDARY_RPC"];
  const path = legPath(p, side);
  const tokens = legTokens(p, side);
  const head = await primary.getBlockNumber();
  const at = (c: typeof primary, blockNumber: bigint, amt: bigint) =>
    c.simulateContract({ address: QUOTER, abi, functionName: "quoteExactInput", args: [path, amt], blockNumber }).then((r) => r.result);
  const probeIn = amountIn / 1000n > 0n ? amountIn / 1000n : 1n;
  const [main, probe, gasPrice, registryEntry, registryCount, routerFeeBps, paused, routerCode, venueCode, quoterCode] = await Promise.all([
    at(primary, head, amountIn),
    at(primary, head, probeIn),
    primary.getGasPrice(),
    primary.readContract({ address: ROUTER_V4, abi, functionName: "routers", args: [BigInt(ROUTER_V4_BDEX_V3_ID)], blockNumber: head }),
    primary.readContract({ address: ROUTER_V4, abi, functionName: "routerCount", blockNumber: head }),
    primary.readContract({ address: ROUTER_V4, abi, functionName: "routerFeeBps", args: [BigInt(ROUTER_V4_BDEX_V3_ID)], blockNumber: head }),
    primary.readContract({ address: ROUTER_V4, abi, functionName: "paused", blockNumber: head }),
    primary.getCode({ address: ROUTER_V4, blockNumber: head }),
    primary.getCode({ address: M.bdexV3Router as Address, blockNumber: head }),
    primary.getCode({ address: QUOTER, blockNumber: head }),
  ]);

  const pools: Address[] = [];
  let poolIdentity = true;
  let liquidityVerified = true;
  for (let i = 0; i < tokens.length - 1; i++) {
    const tokenIn = tokens[i]!, tokenOut = tokens[i + 1]!, fee = (side === "sell" ? p.fees : [...p.fees].reverse())[i]!;
    const pool = await primary.readContract({ address: M.bdexV3Factory as Address, abi, functionName: "getPool", args: [tokenIn as Address, tokenOut as Address, fee], blockNumber: head }) as Address;
    pools.push(pool.toLowerCase() as Address);
    const [token0, token1, poolFee, liquidity, slot0, code] = await Promise.all([
      primary.readContract({ address: pool, abi, functionName: "token0", blockNumber: head }) as Promise<Address>,
      primary.readContract({ address: pool, abi, functionName: "token1", blockNumber: head }) as Promise<Address>,
      primary.readContract({ address: pool, abi, functionName: "fee", blockNumber: head }) as Promise<number>,
      primary.readContract({ address: pool, abi, functionName: "liquidity", blockNumber: head }) as Promise<bigint>,
      primary.readContract({ address: pool, abi, functionName: "slot0", blockNumber: head }) as Promise<readonly [bigint, number, number, number, number, number, boolean]>,
      primary.getCode({ address: pool, blockNumber: head }),
    ]);
    const tokensMatch = [token0.toLowerCase(), token1.toLowerCase()].sort().join(":") === [tokenIn.toLowerCase(), tokenOut.toLowerCase()].sort().join(":");
    poolIdentity &&= tokensMatch && Number(poolFee) === fee && !!code && code !== "0x";
    liquidityVerified &&= liquidity > 0n && slot0[0] > 0n && slot0[6];
  }
  if (p.id === "CA/BOT" || p.id === "CA/USDT") poolIdentity &&= pools[0]?.toLowerCase() === CA_WBOT_BDEX_V3_POOL.toLowerCase();
  if (p.id === "CA/BOT") poolIdentity &&= tokens.length === 2 && p.fees[0] === 10000;

  const crossClient = sec ? createPublicClient({ transport: http(sec, { timeout: 8_000 }) }) : primary;
  const cross = await at(crossClient, sec ? head : head - 1n, amountIn).then((r) => r[0]).catch(() => null);
  const ideal = (probe[0] * amountIn) / probeIn;
  const impact = ideal > 0n && main[0] < ideal ? Number(((ideal - main[0]) * 10_000n) / ideal) : 0;
  const gasUnits = main[3] + 180_000n;
  const tokenOut = side === "buy" ? p.base : p.quote;
  const bdex: ComparedRoute = {
    key: `bdex-v3:${p.id}:${side}:${tokens.join(">")}:${p.fees.join(",")}`,
    venue: "BDEX V3",
    executionClass: "REGISTERED_EXECUTABLE",
    routerId: ROUTER_V4_BDEX_V3_ID,
    router: M.bdexV3Router.toLowerCase(),
    factory: M.bdexV3Factory.toLowerCase(),
    pool: pools.join(">"),
    wrappedNative: M.wbot.toLowerCase(),
    caller: ROUTER_V4.toLowerCase(),
    path: tokens.map((a) => a.toLowerCase()),
    amountIn,
    amountOut: main[0],
    gasUnits,
    gasPriceWei: gasPrice,
    gasCostInOutput: tokenOut.native ? gasUnits * gasPrice : null,
    priceImpactBps: impact,
    externalDirectionalFeeBps: 0,
    feeMutable: false,
    registered: registryCount > 0n && registryEntry[3],
    identityVerified: registryEntry[0].toLowerCase() === M.bdexV3Router.toLowerCase()
      && registryEntry[1] === 1
      && poolIdentity
      && !!routerCode && keccak256(routerCode) === ROUTER_V4_RUNTIME_KECCAK
      && !!venueCode && venueCode !== "0x"
      && !!quoterCode && quoterCode !== "0x",
    wrapperVerified: registryEntry[2].toLowerCase() === M.wbot.toLowerCase(),
    feeVerified: Number(routerFeeBps) === ROUTER_V4_FEE_BPS_BDEX_V3,
    liquidityVerified,
    approvalVerified: !paused,
    block: Number(head),
    rejections: [],
  };
  const alternative = p.id === "CA/BOT"
    ? await quoteAlternativeCaSwap({ client: primary, blockNumber: head, amountIn, side, gasPriceWei: gasPrice }).catch(() => null)
    : null;
  const selected = selectBestExecutableRoute(alternative ? [bdex, alternative] : [bdex]);
  if (!selected) throw new Error(`NO_EXECUTABLE_ROUTE:${bdex.rejections.join(",")}`);
  assertRouteExecutable(selected);
  return {
    amountIn,
    amountOut: selected.amountOut,
    block: Number(head),
    headBlock: Number(head),
    fetchedAt: Date.now(),
    crossCheckOut: cross,
    priceImpactBps: selected.priceImpactBps,
    gasUnits: selected.gasUnits,
    gasPriceWei: selected.gasPriceWei,
    route: selected,
    quoteOnlyAlternatives: alternative ? [alternative] : [],
  };
}
