// Multi-hop quoter against the Bohr DEX (bdexRouter / bdexFactory).
// Tries direct pool, then hops through WBOT or USDT, and returns the
// best-priced route.
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { botMainnet, botTestnet } from "@/lib/wagmi";
import { getContracts, UNISWAP_V2_ROUTER_ABI } from "@/lib/contracts";
import { NATIVE_TOKEN_ADDRESS, type Token } from "./tokenRegistry";

const FACTORY_ABI = parseAbi([
  "function getPair(address tokenA, address tokenB) view returns (address pair)",
]);

const ZERO = "0x0000000000000000000000000000000000000000" as const;

export interface QuoteResult {
  amountOut: bigint;
  // Path of ERC20 addresses passed to router (native BOT replaced with WBOT).
  path: Address[];
  // Display-friendly path of token symbols (uses native BOT symbol when applicable).
  symbolPath: string[];
}

function publicClient(isMainnet: boolean) {
  return createPublicClient({
    chain: isMainnet ? botMainnet : botTestnet,
    transport: http(),
  });
}

// Convert a token to the address used on-chain. Native BOT is wrapped.
function onChainAddr(t: Token, wbot: string): Address {
  return (t.isNative ? wbot : t.address).toLowerCase() as Address;
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

async function quoteOnce(
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

export async function getBestRoute(
  tokenIn: Token,
  tokenOut: Token,
  amountIn: bigint,
  isMainnet: boolean,
): Promise<QuoteResult | null> {
  if (amountIn <= 0n) return null;
  if (tokenIn.address.toLowerCase() === tokenOut.address.toLowerCase()) return null;

  const c = getContracts(isMainnet);
  const wbot = c.wbot.toLowerCase() as Address;
  const usdt = c.usdtBot.toLowerCase() as Address;
  const factory = c.bdexFactory.toLowerCase() as Address;
  const router = c.bdexRouter.toLowerCase() as Address;
  const client = publicClient(isMainnet);

  const inAddr = onChainAddr(tokenIn, wbot);
  const outAddr = onChainAddr(tokenOut, wbot);

  if (inAddr === outAddr) return null;

  const candidates: { path: Address[]; symbolPath: string[] }[] = [];

  // Direct
  if (await pairExists(client, factory, inAddr, outAddr)) {
    candidates.push({
      path: [inAddr, outAddr],
      symbolPath: [tokenIn.symbol, tokenOut.symbol],
    });
  }

  // Hop through WBOT (skip if either side already WBOT)
  if (inAddr !== wbot && outAddr !== wbot) {
    const ok1 = await pairExists(client, factory, inAddr, wbot);
    const ok2 = await pairExists(client, factory, wbot, outAddr);
    if (ok1 && ok2) {
      candidates.push({
        path: [inAddr, wbot, outAddr],
        symbolPath: [tokenIn.symbol, "WBOT", tokenOut.symbol],
      });
    }
  }

  // Hop through USDT (skip if either side already USDT)
  if (inAddr !== usdt && outAddr !== usdt) {
    const ok1 = await pairExists(client, factory, inAddr, usdt);
    const ok2 = await pairExists(client, factory, usdt, outAddr);
    if (ok1 && ok2) {
      candidates.push({
        path: [inAddr, usdt, outAddr],
        symbolPath: [tokenIn.symbol, "USDT", tokenOut.symbol],
      });
    }
  }

  if (candidates.length === 0) return null;

  let best: QuoteResult | null = null;
  for (const c of candidates) {
    const out = await quoteOnce(client, router, amountIn, c.path);
    if (out !== null && out > 0n && (!best || out > best.amountOut)) {
      best = { amountOut: out, path: c.path, symbolPath: c.symbolPath };
    }
  }
  return best;
}

export async function hasAnyLiquidity(
  tokenAddress: string,
  isMainnet: boolean,
): Promise<boolean> {
  const c = getContracts(isMainnet);
  const factory = c.bdexFactory.toLowerCase() as Address;
  const client = publicClient(isMainnet);
  const candidate = tokenAddress.toLowerCase() as Address;
  const wbot = c.wbot.toLowerCase() as Address;
  const usdt = c.usdtBot.toLowerCase() as Address;
  if (candidate === wbot || candidate === usdt) return true;
  const [a, b] = await Promise.all([
    pairExists(client, factory, candidate, wbot),
    pairExists(client, factory, candidate, usdt),
  ]);
  return a || b;
}

export { NATIVE_TOKEN_ADDRESS };
