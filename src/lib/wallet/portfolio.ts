// Read-only portfolio reader for the /wallet tab.
// The network is auto-detected from the connected wallet: BOT Chain balances are
// priced with the existing on-chain quoter, other supported chains use a public
// USD price feed. No pricing rules are duplicated.
import { createPublicClient, http, type Address } from "viem";
import { ERC20_ABI, getContracts } from "@/lib/contracts";
import { getBestRoute } from "@/lib/swap/quoter";
import {
  NATIVE_TOKEN_ADDRESS,
  getCuratedTokens,
  getImportedTokens,
  type Token,
} from "@/lib/swap/tokenRegistry";
import {
  DEFAULT_WALLET_NETWORK,
  findWalletNetwork,
  type WalletNetwork,
} from "@/lib/wallet/networks";

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
  /** the network these balances were read from */
  network: WalletNetwork;
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

export function walletTokens(network: WalletNetwork): Token[] {
  const list = network.useQuoterPricing
    ? [...getCuratedTokens(true), ...getImportedTokens(true)]
    : network.tokens;
  const seen = new Set<string>();
  return list.filter((t) => {
    const key = t.address.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Public USD prices for non-BOT chains, keyed by token symbol. */
async function fetchFeedPrices(network: WalletNetwork): Promise<Record<string, number>> {
  const ids = Array.from(new Set(Object.values(network.priceIds)));
  if (!ids.length) return {};
  try {
    const res = await withTimeout(
      fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd`,
      ),
      8_000,
    );
    const data = (await res.json()) as Record<string, { usd?: number }>;
    const out: Record<string, number> = {};
    for (const [symbol, id] of Object.entries(network.priceIds)) {
      const p = Number(data?.[id]?.usd ?? 0);
      if (p > 0) out[symbol] = p;
    }
    return out;
  } catch {
    return {};
  }
}

export async function fetchPortfolio(
  address: string,
  chainId?: number,
): Promise<Portfolio> {
  const network = findWalletNetwork(chainId) ?? DEFAULT_WALLET_NETWORK;
  const tokens = walletTokens(network);
  const pub = createPublicClient({
    chain: network.chain,
    transport: http(undefined, { batch: true }),
  });

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

  let prices: (number | null)[];

  if (network.useQuoterPricing) {
    const c = getContracts(true);
    const usdt: Token = {
      address: c.usdtBot.toLowerCase(),
      symbol: "USDT",
      name: "Tether USD",
      decimals: 6,
    };
    // BOT / WBOT / CA use the same MARKET price shown on /markets so the
    // portfolio never disagrees with the markets page. Anything else falls
    // back to an executable quote against USDT.
    const spot = await withTimeout(
      import("@/lib/markets/spotPrice").then((m) => m.fetchBotChainSpotPrices(true)),
    ).catch(() => null);
    const marketPrice = (symbol: string): number | null => {
      const s = symbol.toUpperCase();
      if (!spot) return null;
      if (s === "BOT" || s === "WBOT") return spot.bot > 0 ? spot.bot : null;
      if (s === "CA") return spot.ca > 0 ? spot.ca : null;
      return null;
    };
    prices = await Promise.all(
      tokens.map(async (t, i): Promise<number | null> => {
        if (amounts[i] <= 0) return 0;
        if (t.address === usdt.address) return 1;
        const mkt = marketPrice(t.symbol);
        if (mkt != null) return mkt;
        try {
          const r = await withTimeout(
            getBestRoute(t, usdt, 10n ** BigInt(t.decimals), true),
          );
          if (!r || r.amountOut <= 0n) return null;
          return Number(r.amountOut) / 1e6;
        } catch {
          return null;
        }
      }),
    );
  } else {
    const feed = await fetchFeedPrices(network);
    prices = tokens.map((t, i) => {
      if (amounts[i] <= 0) return 0;
      const p = feed[t.symbol.toUpperCase()] ?? feed[t.symbol];
      return p && p > 0 ? p : null;
    });
  }

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
    network,
  };
}
