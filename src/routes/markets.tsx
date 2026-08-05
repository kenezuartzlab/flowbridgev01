import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowLeftRight, RefreshCw, Search, TrendingDown, TrendingUp } from "lucide-react";
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
          "Live prices, 24h change, volume and 7-day trends for BOT Chain tokens (BOT, CA, USDT) plus top ETH, BNB and TRON tokens.",
      },
      { property: "og:title", content: "FlowBridge Markets" },
      { property: "og:description", content: "BOT Chain + top cross-chain token prices, updated live." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://flowbridge.space/markets" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://flowbridge.space/markets" }],
  }),

  component: MarketsPage,
});

type ChainFilter = "ALL" | "BOT" | "MAJOR" | "ETH" | "BSC" | "TRON";
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

  const movers = useMemo(() => {
    return [...bot, ...ext]
      .filter((r) => r.change24h != null && r.change24h !== 0)
      .sort((a, b) => Math.abs(b.change24h ?? 0) - Math.abs(a.change24h ?? 0))
      .slice(0, 6);
  }, [bot, ext]);

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
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-hairline bg-card-alt px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <Link
            to="/"
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-2 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <h1 className="truncate font-mono text-[13px] font-black uppercase tracking-[0.14em]">
            Markets<span className="text-primary">.</span>
          </h1>
          <button
            type="button"
            onClick={() => setTick((n) => n + 1)}
            disabled={loading}
            aria-label="Refresh market prices"
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-hairline px-3 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-muted transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 p-3 sm:p-4">
        {/* Top movers */}
        {movers.length > 0 && (
          <section className="fb-surface p-3 sm:p-4">
            <p className="fb-eyebrow">Top movers · 24h</p>
            <div className="-mx-1 mt-2 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
              {movers.map((m) => {
                const up = (m.change24h ?? 0) >= 0;
                return (
                  <div
                    key={`mv-${m.chain}-${m.id}`}
                    className="fb-inset flex shrink-0 snap-start items-center gap-2 px-3 py-2"
                  >
                    <TokenIcon symbol={m.symbol} preset="sm" />
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] font-black uppercase tracking-[0.06em]">
                        {m.symbol}
                      </p>
                      <p
                        className={`font-mono text-[10px] font-black tabular-nums ${up ? "text-success" : "text-danger"}`}
                      >
                        {up ? "+" : ""}
                        {(m.change24h ?? 0).toFixed(2)}%
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Search + filters */}
        <section className="space-y-2.5">
          <div className="fb-inset flex items-center gap-2 px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search token…"
              aria-label="Search token"
              className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-foreground placeholder:text-muted/70 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="fb-segment-track font-mono">
              {(["ALL", "BOT", "MAJOR", "ETH", "BSC", "TRON"] as ChainFilter[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChain(c)}
                  aria-selected={chain === c}
                  className={
                    "fb-segment min-h-[34px] cursor-pointer truncate px-2 text-[10.5px] font-black uppercase tracking-[0.08em] " +
                    (chain === c ? "" : "text-muted hover:bg-foreground/5 hover:text-foreground")
                  }
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-1">
              {(["mcap", "price", "change"] as SortKey[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSortKey(s)}
                  className={
                    "min-h-[32px] cursor-pointer rounded-lg border px-2 font-mono text-[10px] font-black uppercase tracking-[0.06em] transition-colors " +
                    (sortKey === s
                      ? "border-primary/40 bg-primary/12 text-primary"
                      : "border-hairline text-muted hover:text-foreground")
                  }
                >
                  {s === "mcap" ? "Mcap" : s === "price" ? "Price" : "24h %"}
                </button>
              ))}
            </div>
          </div>
        </section>

        {loading && bot.length === 0 && (
          <div className="fb-surface space-y-2 p-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="fb-inset h-12 animate-pulse" />
            ))}
          </div>
        )}

        {(!loading || bot.length > 0) && (
          <section className="fb-surface overflow-hidden">
            <div className="hidden gap-2 border-b border-hairline px-4 py-2 font-mono text-[9.5px] font-black uppercase tracking-[0.12em] text-muted sm:grid sm:grid-cols-[1fr_78px_104px_88px_104px]">
              <span>Token</span>
              <span className="text-right">7d</span>
              <span className="text-right">Price</span>
              <span className="text-right">24h</span>
              <span className="text-right">Mkt cap</span>
            </div>

            {rows.length === 0 && (
              <p className="p-6 text-center font-mono text-[11px] text-muted">
                No tokens match your filters.
              </p>
            )}

            {rows.map((r, idx) => (
              <div key={`${r.chain}-${r.id}-${idx}`}>
                {chain === "ALL" && idx > 0 && rows[idx - 1].chain === "BOT" && r.chain !== "BOT" && (
                  <div className="border-t border-hairline px-4 pb-1 pt-3">
                    <p className="fb-eyebrow">
                      Top cross-chain · {rows.filter((x) => x.chain !== "BOT").length}
                    </p>
                  </div>
                )}
                {chain === "ALL" && idx === 0 && r.chain === "BOT" && (
                  <div className="px-4 pb-1 pt-3">
                    <p className="fb-eyebrow">
                      BOT Chain · {rows.filter((x) => x.chain === "BOT").length}
                    </p>
                  </div>
                )}
                <MarketRowView row={r} />
              </div>
            ))}
          </section>
        )}

        <p className="pt-1 text-center font-mono text-[9.5px] leading-relaxed text-muted">
          BOT Chain prices are on-chain (BDex V3 / CaSwap V2). Cross-chain prices and 7-day trends via
          CoinGecko public API. Auto-refreshes every 60s.
        </p>
      </main>
      <BottomNav />
    </div>
  );
}

function sortRow(a: MarketRow, b: MarketRow, key: SortKey): number {
  if (key === "price") return b.priceUsd - a.priceUsd;
  if (key === "change") return (b.change24h ?? -Infinity) - (a.change24h ?? -Infinity);
  return (b.marketCap ?? -Infinity) - (a.marketCap ?? -Infinity);
}

/** Inline 7-day sparkline. Purely presentational — no data fetching here. */
function Sparkline({ points, up }: { points: number[]; up: boolean }) {
  const w = 72;
  const h = 24;
  if (points.length < 2) return <span className="font-mono text-[10px] text-muted">—</span>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / span) * (h - 2) - 1;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      aria-hidden
      className="overflow-visible"
      preserveAspectRatio="none"
    >
      <path
        d={d}
        fill="none"
        stroke={up ? "var(--fb-success)" : "var(--fb-danger)"}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MarketRowView({ row }: { row: MarketRow }) {
  const up = (row.change24h ?? 0) >= 0;
  const change =
    row.change24h == null ? null : `${up ? "+" : ""}${row.change24h.toFixed(2)}%`;

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-2 border-b border-hairline px-4 py-2.5 transition-colors last:border-0 hover:bg-foreground/[0.03] sm:grid-cols-[1fr_78px_104px_88px_104px]">
      <div className="flex min-w-0 items-center gap-3">
        <TokenIcon symbol={row.symbol} size={30} />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-mono text-[12.5px] font-black uppercase tracking-[0.06em]">
              {row.symbol}
            </span>
            <span className="shrink-0 rounded bg-foreground/8 px-1.5 py-0.5 font-mono text-[8.5px] font-black uppercase tracking-[0.1em] text-muted">
              {row.chain}
            </span>
            {row.chain === "BOT" && (
              <Link
                to="/"
                aria-label={`Swap ${row.symbol}`}
                className="shrink-0 rounded-md p-1 text-primary transition-colors hover:bg-primary/12"
              >
                <ArrowLeftRight className="h-3 w-3" />
              </Link>
            )}
          </div>
          <p className="truncate font-mono text-[10px] uppercase tracking-[0.05em] text-muted">
            {row.name}
            {row.volume24h ? ` · Vol ${compactUsd(row.volume24h)}` : ""}
          </p>
        </div>
      </div>

      <div className="hidden justify-end sm:flex">
        {row.sparkline && row.sparkline.length > 1 ? (
          <Sparkline points={row.sparkline} up={up} />
        ) : (
          <span className="font-mono text-[10px] text-muted">—</span>
        )}
      </div>

      <div className="text-right">
        <p className="font-mono text-[12.5px] font-black tabular-nums">{formatUsd(row.priceUsd)}</p>
        {change && (
          <p
            className={`font-mono text-[10px] font-black tabular-nums sm:hidden ${up ? "text-success" : "text-danger"}`}
          >
            {change}
          </p>
        )}
      </div>

      <div className="hidden items-center justify-end gap-1 font-mono text-[12px] font-black tabular-nums sm:flex">
        {change == null ? (
          <span className="text-muted">—</span>
        ) : (
          <span className={`flex items-center gap-1 ${up ? "text-success" : "text-danger"}`}>
            {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {change}
          </span>
        )}
      </div>

      <div className="hidden text-right font-mono text-[11px] tabular-nums text-muted sm:block">
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
