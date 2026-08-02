import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Gift,
  LineChart,
  History,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Waves,
} from "lucide-react";
import { BottomNav } from "@/components/nav/BottomNav";
import { TokenIcon } from "@/components/TokenIcon";
import { useAccountData } from "@/lib/app/useAccountData";
import { fetchBotChainMarkets, type MarketRow } from "@/lib/markets/marketFeed";
import { formatUsd } from "@/lib/format";

export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [
      { title: "Home — Your FlowBridge Dashboard" },
      {
        name: "description",
        content:
          "Your FlowBridge home: FLOW points, recent swap and bridge activity, live BOT Chain prices and one-tap access to swap, bridge and rewards.",
      },
      { property: "og:title", content: "FlowBridge Home Dashboard" },
      {
        property: "og:description",
        content: "FLOW points, live BOT Chain prices and recent activity in one place.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://flowbridge.space/home" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://flowbridge.space/home" }],
  }),
  component: HomePage,
});

const QUICK_ACTIONS = [
  { to: "/", label: "Swap", hint: "Best route", Icon: ArrowLeftRight },
  { to: "/markets", label: "Markets", hint: "Live prices", Icon: LineChart },
  { to: "/rewards", label: "Rewards", hint: "FLOW points", Icon: Gift },
  { to: "/activity", label: "Activity", hint: "Your history", Icon: History },
] as const;

function HomePage() {
  const { user, incentives, transactions, loading } = useAccountData();
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [marketsLoading, setMarketsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchBotChainMarkets(true);
        if (!cancelled) setMarkets(rows.filter((r) => r.symbol !== "WBOT").slice(0, 4));
      } finally {
        if (!cancelled) setMarketsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const flowPoints = Number(incentives?.flowPoints ?? 0);
  const claimable = Number(incentives?.claimablePoints ?? incentives?.claimable ?? 0);

  const recent = useMemo(() => transactions.slice(0, 4), [transactions]);

  const volumeUsd = useMemo(
    () =>
      transactions.reduce(
        (sum: number, t: any) => sum + (Number(t.volume_usd ?? t.volumeUsd ?? 0) || 0),
        0,
      ),
    [transactions],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-hairline bg-card-alt px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
              <Waves className="h-4 w-4" />
            </span>
            <h1 className="truncate font-mono text-[13px] font-black uppercase tracking-[0.14em]">
              Home<span className="text-primary">.</span>
            </h1>
          </div>
          <Link
            to="/"
            className="fb-glow inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-primary px-3 font-mono text-[11px] font-black uppercase tracking-[0.1em] text-primary-foreground"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Trade
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 p-3 sm:p-4">
        {/* Summary */}
        <section className="fb-surface p-4">
          <p className="fb-eyebrow">FLOW balance</p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
            <p className="font-mono text-3xl font-black leading-none tabular-nums">
              {loading && !incentives ? "—" : flowPoints.toLocaleString("en-US")}
              <span className="ml-1.5 align-baseline text-[12px] font-black text-muted">FLOW</span>
            </p>
            <Link
              to="/rewards"
              className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-hairline px-3 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-muted transition-colors hover:border-primary/40 hover:text-foreground"
            >
              Rewards <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="fb-inset px-3 py-2">
              <p className="fb-eyebrow">Claimable</p>
              <p className="mt-0.5 font-mono text-[15px] font-black tabular-nums text-primary">
                {claimable.toLocaleString("en-US")}
              </p>
            </div>
            <div className="fb-inset px-3 py-2">
              <p className="fb-eyebrow">Swap volume</p>
              <p className="mt-0.5 font-mono text-[15px] font-black tabular-nums">
                {volumeUsd > 0 ? formatUsd(volumeUsd) : "—"}
              </p>
            </div>
          </div>

          {!user && (
            <p className="mt-3 flex items-start gap-1.5 font-mono text-[10.5px] leading-relaxed text-muted">
              <Sparkles className="mt-[1px] h-3 w-3 shrink-0 text-primary" />
              Sign in from the trade screen to start accruing FLOW on every swap.
            </p>
          )}
        </section>

        {/* Quick actions */}
        <section>
          <p className="fb-eyebrow mb-2 px-1">Quick actions</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {QUICK_ACTIONS.map(({ to, label, hint, Icon }) => (
              <Link
                key={to}
                to={to}
                className="glass-card flex min-h-[76px] flex-col justify-between rounded-[var(--fb-radius-md)] p-3"
              >
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/12 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-mono text-[11px] font-black uppercase tracking-[0.08em]">
                    {label}
                  </span>
                  <span className="block truncate font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
                    {hint}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Markets snapshot */}
        <section className="fb-surface overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
            <p className="fb-eyebrow">BOT Chain prices</p>
            <Link
              to="/markets"
              className="font-mono text-[10px] font-black uppercase tracking-[0.1em] text-primary"
            >
              All markets
            </Link>
          </div>
          {marketsLoading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="fb-inset h-11 animate-pulse" />
              ))}
            </div>
          ) : markets.length === 0 ? (
            <p className="p-4 font-mono text-[11px] text-muted">Prices unavailable right now.</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {markets.map((row) => (
                <li key={row.id} className="flex items-center gap-3 px-4 py-2.5">
                  <TokenIcon symbol={row.symbol} className="h-7 w-7 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[12px] font-black uppercase tracking-[0.06em]">
                      {row.symbol}
                    </p>
                    <p className="truncate font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">
                      {row.name}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-[12px] font-black tabular-nums">
                      {row.priceUsd > 0 ? formatUsd(row.priceUsd) : "—"}
                    </p>
                    {row.change24h != null && (
                      <p
                        className={`flex items-center justify-end gap-0.5 font-mono text-[9.5px] font-black tabular-nums ${
                          row.change24h >= 0 ? "text-success" : "text-danger"
                        }`}
                      >
                        {row.change24h >= 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {Math.abs(row.change24h).toFixed(2)}%
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent activity */}
        <section className="fb-surface overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
            <p className="fb-eyebrow">Recent activity</p>
            <Link
              to="/activity"
              className="font-mono text-[10px] font-black uppercase tracking-[0.1em] text-primary"
            >
              View all
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="p-4 font-mono text-[11px] leading-relaxed text-muted">
              No transactions yet. Your swaps and bridges will appear here.
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {recent.map((t: any, i: number) => {
                const kind = String(t.tx_type ?? t.txType ?? "SWAP").toUpperCase();
                const dir = String(t.direction ?? "").replace(/_/g, " ");
                const at = new Date(t.created_at ?? t.createdAt ?? Date.now());
                return (
                  <li key={t.id ?? `${t.tx_hash ?? i}`} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
                      {kind === "BRIDGE" ? (
                        <ArrowUpRight className="h-4 w-4" />
                      ) : (
                        <ArrowLeftRight className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[11.5px] font-black uppercase tracking-[0.06em]">
                        {kind}
                        {dir ? ` · ${dir}` : ""}
                      </p>
                      <p className="truncate font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">
                        {at.toLocaleDateString()} {at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[10px] font-black uppercase tracking-[0.08em] text-muted">
                      {String(t.status ?? "").toUpperCase() || "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
