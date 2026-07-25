import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search, TrendingUp, TrendingDown } from "lucide-react";
import { TokenIcon } from "@/components/TokenIcon";
import { BottomNav } from "@/components/nav/BottomNav";
import { formatUsd } from "@/lib/format";
import { fetchBotChainMarkets, fetchExternalMarkets, type MarketRow } from "@/lib/markets/marketFeed";

export const Route = createFileRoute("/markets")({
  head: () => ({
    meta: [
      { title: "Markets — Live Token Prices | FlowBridge" },
      {
        name: "description",
        content:
          "Live prices, 24h change and liquidity for BOT Chain tokens (BOT, CA, USDT and imported LPs) plus top ETH, BNB and TRON tokens.",
      },
      { property: "og:title", content: "FlowBridge Markets" },
      { property: "og:description", content: "BOT Chain + top cross-chain token prices, updated live." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MarketsPage,
});

type ChainFilter = "ALL" | "BOT" | "ETH" | "BSC" | "TRON";
type SortKey = "price" | "change" | "mcap";

function MarketsPage() {
  const [isMainnet] = useState(true);
  const [bot, setBot] = useState<MarketRow[]>([]);
  const [ext, setExt] = useState<MarketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [chain, setChain] = useState<ChainFilter>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("mcap");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [b, e] = await Promise.all([
          fetchBotChainMarkets(isMainnet),
          fetchExternalMarkets(),
        ]);
        if (cancelled) return;
        setBot(b);
        setExt(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isMainnet, tick]);

  // Auto-refresh every 60s
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo(() => {
    let all = [...bot, ...ext];
    if (chain !== "ALL") all = all.filter((r) => r.chain === chain);
    const q = query.trim().toLowerCase();
    if (q) {
      all = all.filter(
        (r) =>
          r.symbol.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q),
      );
    }
    // Always keep BOT chain rows on top when ALL
    if (chain === "ALL") {
      const botRows = all.filter((r) => r.chain === "BOT");
      const others = all.filter((r) => r.chain !== "BOT");
      others.sort((a, b) => sortRow(a, b, sortKey));
      return [...botRows.sort((a, b) => sortRow(a, b, sortKey)), ...others];
    }
    all.sort((a, b) => sortRow(a, b, sortKey));
    return all;
  }, [bot, ext, chain, query, sortKey]);

  return (
    <div className="min-h-screen bg-[#010C1B] text-white font-mono">
      <header className="flex items-center justify-between gap-3 p-4 border-b border-white/10">
        <Link
          to="/"
          className="flex items-center gap-2 text-[#C5C1B9] hover:text-[#32FF8B] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-xs font-black uppercase tracking-widest">Back</span>
        </Link>
        <h1 className="text-sm sm:text-base font-black uppercase tracking-widest">
          Markets<span className="text-[#32FF8B]">.</span>
        </h1>
        <div className="w-16" />
      </header>

      <div className="max-w-5xl mx-auto p-4 space-y-4">
        {/* Search + filters */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 bg-[#0D1C2A] border border-white/10 rounded-xl px-3 py-2.5">
            <Search className="w-4 h-4 text-[#C5C1B9] shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search token…"
              className="bg-transparent text-white text-sm flex-1 focus:outline-none placeholder:text-[#C5C1B9]/60"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {(["ALL", "BOT", "ETH", "BSC", "TRON"] as ChainFilter[]).map((c) => (
              <button
                key={c}
                onClick={() => setChain(c)}
                className={
                  "px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest border transition-colors shrink-0 cursor-pointer " +
                  (chain === c
                    ? "bg-[#32FF8B]/15 border-[#32FF8B]/50 text-[#32FF8B]"
                    : "bg-[#0D1C2A] border-white/10 text-[#C5C1B9] hover:text-white")
                }
              >
                {c === "BOT" ? "BOT Chain" : c}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-1 shrink-0">
              {(["mcap", "price", "change"] as SortKey[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSortKey(s)}
                  className={
                    "px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border cursor-pointer " +
                    (sortKey === s
                      ? "bg-white/10 border-white/20 text-white"
                      : "bg-transparent border-white/5 text-[#C5C1B9] hover:text-white")
                  }
                >
                  {s === "mcap" ? "Mcap" : s === "price" ? "Price" : "24h %"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading && (
          <div className="text-center py-16 text-[#C5C1B9] text-sm">
            Loading live prices…
          </div>
        )}

        {!loading && (
          <>
            {chain === "ALL" && (
              <SectionLabel label="BOT Chain Tokens" count={rows.filter((r) => r.chain === "BOT").length} />
            )}
            <div className="rounded-2xl border border-white/10 overflow-hidden bg-[#0D1C2A]/50">
              <div className="hidden sm:grid grid-cols-[1fr_100px_90px_110px] gap-2 px-4 py-2 text-[10px] uppercase tracking-widest text-[#C5C1B9]/70 border-b border-white/5 font-black">
                <span>Token</span>
                <span className="text-right">Price</span>
                <span className="text-right">24h</span>
                <span className="text-right">Market Cap</span>
              </div>

              {rows.length === 0 && (
                <div className="text-center py-10 text-[#C5C1B9] text-sm">
                  No tokens match your filters.
                </div>
              )}

              {rows.map((r, idx) => (
                <div key={`${r.chain}-${r.id}-${idx}`}>
                  {chain === "ALL" && idx > 0 && rows[idx - 1].chain === "BOT" && r.chain !== "BOT" && (
                    <div className="px-4 pt-3 pb-1 border-t border-white/5">
                      <SectionLabel label="Top Cross-Chain Tokens" count={rows.filter((x) => x.chain !== "BOT").length} />
                    </div>
                  )}
                  <MarketRowView row={r} />
                </div>
              ))}
            </div>
          </>
        )}

        <p className="text-[10px] text-[#C5C1B9]/50 text-center pt-2 leading-relaxed">
          BOT Chain prices are on-chain (BDex V3 / CaSwap V2). Cross-chain prices via CoinGecko public API.
          Auto-refreshes every 60s.
        </p>
      </div>
      <BottomNav />
    </div>
  );

}

function sortRow(a: MarketRow, b: MarketRow, key: SortKey): number {
  if (key === "price") return b.priceUsd - a.priceUsd;
  if (key === "change") return (b.change24h ?? -Infinity) - (a.change24h ?? -Infinity);
  return (b.marketCap ?? -Infinity) - (a.marketCap ?? -Infinity);
}

function SectionLabel({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 pt-2 pb-1 px-1">
      <span className="text-[10px] tracking-[0.25em] uppercase text-[#32FF8B] font-black">
        {label}
      </span>
      <span className="text-[10px] text-[#C5C1B9]/50 font-black">·  {count}</span>
    </div>
  );
}

function MarketRowView({ row }: { row: MarketRow }) {
  const up = (row.change24h ?? 0) >= 0;
  return (
    <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_100px_90px_110px] gap-2 px-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors items-center">
      <div className="flex items-center gap-3 min-w-0">
        <TokenIcon symbol={row.symbol} size={32} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black tracking-wider">{row.symbol}</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-[#C5C1B9]/80 uppercase tracking-widest font-black">
              {row.chain}
            </span>
          </div>
          <div className="text-[11px] text-[#C5C1B9] truncate">{row.name}</div>
        </div>
      </div>
      <div className="text-right sm:text-right">
        <div className="text-sm font-bold">{formatUsd(row.priceUsd)}</div>
        <div className="sm:hidden text-[11px] font-bold flex items-center justify-end gap-1">
          {row.change24h != null && (
            <span className={up ? "text-[#32FF8B]" : "text-red-400"}>
              {up ? "+" : ""}
              {row.change24h.toFixed(2)}%
            </span>
          )}
        </div>
      </div>
      <div className="hidden sm:flex items-center justify-end gap-1 text-sm font-bold">
        {row.change24h == null ? (
          <span className="text-[#C5C1B9]/40">—</span>
        ) : up ? (
          <span className="text-[#32FF8B] flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />+{row.change24h.toFixed(2)}%
          </span>
        ) : (
          <span className="text-red-400 flex items-center gap-1">
            <TrendingDown className="w-3 h-3" />
            {row.change24h.toFixed(2)}%
          </span>
        )}
      </div>
      <div className="hidden sm:block text-right text-[12px] text-[#C5C1B9]">
        {row.marketCap ? compactUsd(row.marketCap) : "—"}
      </div>
    </div>
  );
}

function compactUsd(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}
