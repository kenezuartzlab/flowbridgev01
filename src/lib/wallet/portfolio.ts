// Read-only portfolio reader for the /wallet tab.
// Balances come from the BOT Chain RPC (native + ERC-20 multicall-style reads),
// USD prices reuse the existing quoter so no pricing rules are duplicated.
import { createPublicClient, http, type Address } from "viem";
import { botMainnet, botTestnet } from "@/lib/wagmi";
import { ERC20_ABI, getContracts } from "@/lib/contracts";
import { getBestRoute } from "@/lib/swap/quoter";
import {
  NATIVE_TOKEN_ADDRESS,
  getCuratedTokens,
  getImportedTokens,
  type Token,
} from "@/lib/swap/tokenRegistry";

export interface HoldingRow {
  token: Token;
  amount: number;
  priceUsd: number;
  valueUsd: number;
}

export interface Portfolio {
  rows: HoldingRow[];
  totalUsd: number;
}

function client(isMainnet: boolean) {
  return createPublicClient({
    chain: isMainnet ? botMainnet : botTestnet,
    transport: http(),
  });
}

export function walletTokens(isMainnet: boolean): Token[] {
  const seen = new Set<string>();
  return [...getCuratedTokens(isMainnet), ...getImportedTokens(isMainnet)].filter((t) => {
    const key = t.address.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function fetchPortfolio(
  address: string,
  isMainnet: boolean,
): Promise<Portfolio> {
  const tokens = walletTokens(isMainnet);
  const pub = client(isMainnet);
  const c = getContracts(isMainnet);
  const usdt: Token = {
    address: c.usdtBot.toLowerCase(),
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
  };

  const balances = await Promise.all(
    tokens.map(async (t) => {
      try {
        if (t.isNative || t.address === NATIVE_TOKEN_ADDRESS) {
          const wei = await pub.getBalance({ address: address as Address });
          return Number(wei) / 10 ** t.decimals;
        }
        const raw = (await pub.readContract({
          address: t.address as Address,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [address as Address],
        })) as bigint;
        return Number(raw) / 10 ** t.decimals;
      } catch {
        return 0;
      }
    }),
  );

  const prices = await Promise.all(
    tokens.map(async (t, i) => {
      if (balances[i] <= 0) return 0;
      if (t.address === usdt.address) return 1;
      try {
        const r = await getBestRoute(t, usdt, 10n ** BigInt(t.decimals), isMainnet);
        if (!r || r.amountOut <= 0n) return 0;
        return Number(r.amountOut) / 1e6;
      } catch {
        return 0;
      }
    }),
  );

  const rows: HoldingRow[] = tokens.map((token, i) => ({
    token,
    amount: balances[i],
    priceUsd: prices[i],
    valueUsd: balances[i] * prices[i],
  }));

  rows.sort((a, b) => b.valueUsd - a.valueUsd || b.amount - a.amount);

  return { rows, totalUsd: rows.reduce((s, r) => s + r.valueUsd, 0) };
}
