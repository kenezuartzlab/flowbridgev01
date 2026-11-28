// Fresh, caller-aware quote-only diagnostics for the exact alternative CaSwap venue.
// No execution or registry promotion: the venue remains QUOTE_ONLY even if later registered.
import { parseAbi, type Address, type Hex } from "viem";
import { MAINNET_CONTRACTS as M } from "@/lib/contracts";
import { ROUTER_V4 } from "@/lib/autotrade/config";
import {
  ALTERNATIVE_CASWAP_FACTORY,
  ALTERNATIVE_CASWAP_ROUTER,
  CA_WBOT,
  CA_WBOT_CASWAP_POOL,
  evaluateRouteGates,
  type ComparedRoute,
} from "./routeComparison";

const abi = parseAbi([
  "function factory() view returns (address)",
  "function WBOT() view returns (address)",
  "function getPair(address,address) view returns (address)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112,uint112,uint32)",
  "function pairFeeBps(address,address) view returns (uint256)",
  "function MAX_FEE_BPS() view returns (uint256)",
  "function feeToSetter() view returns (address)",
  "function feeExemptOn() view returns (bool)",
  "function isFeeExempt(address) view returns (bool)",
  "function getAmountsOutForUser(uint256,address[],address) view returns (uint256[])",
  "function routerCount() view returns (uint256)",
  "function routers(uint256) view returns (address,uint8,address,bool,string,string)",
]);

interface Reader {
  readContract(args: any): Promise<any>;
  getCode(args: { address: Address; blockNumber?: bigint }): Promise<Hex | undefined>;
}

function impactBps(amountIn: bigint, amountOut: bigint, reserveIn: bigint, reserveOut: bigint): number {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 10000;
  const ideal = (amountIn * reserveOut) / reserveIn;
  return ideal > amountOut ? Number(((ideal - amountOut) * 10000n) / ideal) : 0;
}

/** Quote native BOT -> CA (buy) or CA -> native BOT (sell), using V4 as the fee caller. */
export async function quoteAlternativeCaSwap(args: {
  client: Reader;
  blockNumber: bigint;
  amountIn: bigint;
  side: "buy" | "sell";
  gasPriceWei: bigint;
  caller?: Address;
}): Promise<ComparedRoute> {
  const { client, blockNumber, amountIn, side, gasPriceWei } = args;
  const caller = (args.caller ?? ROUTER_V4).toLowerCase() as Address;
  const router = ALTERNATIVE_CASWAP_ROUTER.toLowerCase() as Address;
  const ca = M.caToken.toLowerCase() as Address;
  const from = side === "buy" ? CA_WBOT.toLowerCase() as Address : ca;
  const to = side === "buy" ? ca : CA_WBOT.toLowerCase() as Address;
  const read = (address: Address, functionName: string, readArgs: any[] = []) => client.readContract({
    address, abi, functionName, args: readArgs, blockNumber,
  });

  const [factory, wrapper, routerCode, factoryCode, wrapperCode, poolCode] = await Promise.all([
    read(router, "factory") as Promise<Address>,
    read(router, "WBOT") as Promise<Address>,
    client.getCode({ address: router, blockNumber }),
    client.getCode({ address: ALTERNATIVE_CASWAP_FACTORY as Address, blockNumber }),
    client.getCode({ address: CA_WBOT as Address, blockNumber }),
    client.getCode({ address: CA_WBOT_CASWAP_POOL as Address, blockNumber }),
  ]);
  const pool = await read(factory, "getPair", [from, to]) as Address;
  const [token0, token1, reserves, directionalFee, maxFee, feeAdmin, exemptionsOn, callerExempt, amounts, registryCount] = await Promise.all([
    read(CA_WBOT_CASWAP_POOL as Address, "token0") as Promise<Address>,
    read(CA_WBOT_CASWAP_POOL as Address, "token1") as Promise<Address>,
    read(CA_WBOT_CASWAP_POOL as Address, "getReserves") as Promise<readonly [bigint, bigint, number]>,
    read(factory, "pairFeeBps", [from, to]) as Promise<bigint>,
    read(factory, "MAX_FEE_BPS") as Promise<bigint>,
    read(factory, "feeToSetter") as Promise<Address>,
    read(factory, "feeExemptOn") as Promise<boolean>,
    read(factory, "isFeeExempt", [caller]) as Promise<boolean>,
    read(router, "getAmountsOutForUser", [amountIn, [from, to], caller]) as Promise<readonly bigint[]>,
    read(ROUTER_V4 as Address, "routerCount") as Promise<bigint>,
  ]);
  let registered = false;
  for (let i = 0n; i < registryCount && i < 32n; i++) {
    const entry = await read(ROUTER_V4 as Address, "routers", [i]) as readonly [Address, number, Address, boolean, string, string];
    if (entry[0].toLowerCase() === router && entry[3]) registered = true;
  }
  const amountOut = amounts[amounts.length - 1] ?? 0n;
  const token0IsCa = token0.toLowerCase() === ca;
  const reserveCa = token0IsCa ? reserves[0] : reserves[1];
  const reserveWrapper = token0IsCa ? reserves[1] : reserves[0];
  const reserveIn = side === "buy" ? reserveWrapper : reserveCa;
  const reserveOut = side === "buy" ? reserveCa : reserveWrapper;
  const exactIdentity = factory.toLowerCase() === ALTERNATIVE_CASWAP_FACTORY.toLowerCase()
    && pool.toLowerCase() === CA_WBOT_CASWAP_POOL.toLowerCase()
    && new Set([token0.toLowerCase(), token1.toLowerCase()]).size === 2
    && [token0.toLowerCase(), token1.toLowerCase()].includes(ca)
    && [token0.toLowerCase(), token1.toLowerCase()].includes(CA_WBOT.toLowerCase())
    && [routerCode, factoryCode, wrapperCode, poolCode].every((code) => !!code && code !== "0x");
  const gasUnits = side === "sell" ? 310_000n : 250_000n;

  return evaluateRouteGates({
    key: "alternative-caswap-ca-cawbot",
    venue: "Alternative CaSwap V2",
    executionClass: "QUOTE_ONLY",
    routerId: null,
    router,
    factory: factory.toLowerCase(),
    pool: pool.toLowerCase(),
    wrappedNative: wrapper.toLowerCase(),
    caller,
    path: [from.toLowerCase(), to.toLowerCase()],
    amountIn,
    amountOut,
    gasUnits,
    gasPriceWei,
    gasCostInOutput: side === "sell" ? gasUnits * gasPriceWei : null,
    priceImpactBps: impactBps(amountIn, amountOut, reserveIn, reserveOut),
    externalDirectionalFeeBps: callerExempt && exemptionsOn ? 0 : Number(directionalFee),
    feeMutable: maxFee > 0n || feeAdmin !== "0x0000000000000000000000000000000000000000",
    registered,
    identityVerified: exactIdentity,
    wrapperVerified: wrapper.toLowerCase() === CA_WBOT.toLowerCase() && wrapper.toLowerCase() !== M.wbot.toLowerCase(),
    feeVerified: directionalFee >= 0n && maxFee >= directionalFee,
    liquidityVerified: reserveIn > 0n && reserveOut > 0n,
    approvalVerified: true,
    block: Number(blockNumber),
    rejections: [],
  });
}
