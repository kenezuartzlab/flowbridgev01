// Read-only portfolio reader for the /wallet tab.
// Balances come from the BOT Chain RPC (native + ERC-20 reads),
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
  /** raw on-chain units, kept so Send can transfer exact balances */
  raw: bigint;
  priceUsd: number;
  valueUsd: number;
  /** true when the balance read failed (shown as "unavailable", not 0) */
  balanceFailed: boolean;
  /** true when the USD price could not be resolved (no liquidity / quoter down) */
  priceUnavailable: boolean;
}

export interface Portfolio {
  rows: HoldingRow[];
  totalUsd: number;
  /** epoch ms of the successful read, for "updated Xs ago" */
  fetchedAt: number;
  /** some balances failed — total is a partial figure */
  partial: boolean;
  /** some prices are missing — total understates the real value */
  pricesPartial: boolean;
}

const READ_TIMEOUT_MS = 12_000;

function withTimeout<T>(p: Promise<T>, ms = READ_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("RPC timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function retry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await withTimeout(fn());
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function client(isMainnet: boolean) {
  return createPublicClient({
    chain: isMainnet ? botMainnet : botTestnet,
    transport: http(undefined, { batch: true }),
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
    tokens.map(async (t): Promise<{ raw: bigint; failed: boolean }> => {
      try {
        if (t.isNative || t.address === NATIVE_TOKEN_ADDRESS) {
          const wei = await retry(() => pub.getBalance({ address: address as Address }));
          return { raw: wei, failed: false };
        }
        const raw = await retry(
          () =>
            pub.readContract({
              address: t.address as Address,
              abi: ERC20_ABI,
              functionName: "balanceOf",
              args: [address as Address],
            }) as Promise<bigint>,
        );
        return { raw, failed: false };
      } catch {
        return { raw: 0n, failed: true };
      }
    }),
  );

  const amounts = balances.map((b, i) => Number(b.raw) / 10 ** tokens[i].decimals);

  const prices = await Promise.all(
    tokens.map(async (t, i): Promise<number | null> => {
      if (amounts[i] <= 0) return 0;
      if (t.address === usdt.address) return 1;
      try {
        const r = await withTimeout(
          getBestRoute(t, usdt, 10n ** BigInt(t.decimals), isMainnet),
        );
        if (!r || r.amountOut <= 0n) return null;
        return Number(r.amountOut) / 1e6;
      } catch {
        return null;
      }
    }),
  );

  const rows: HoldingRow[] = tokens.map((token, i) => {
    const price = prices[i];
    const amount = amounts[i];
    return {
      token,
      amount,
      raw: balances[i].raw,
      priceUsd: price ?? 0,
      valueUsd: price == null ? 0 : amount * price,
      balanceFailed: balances[i].failed,
      priceUnavailable: price == null,
    };
  });

  rows.sort((a, b) => b.valueUsd - a.valueUsd || b.amount - a.amount);

  return {
    rows,
    totalUsd: rows.reduce((s, r) => s + r.valueUsd, 0),
    fetchedAt: Date.now(),
    partial: rows.some((r) => r.balanceFailed),
    pricesPartial: rows.some((r) => r.amount > 0 && r.priceUnavailable),
  };
}
