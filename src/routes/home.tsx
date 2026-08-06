import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Compass,
  Gift,
  Heart,

  LineChart,
  History,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { SignInButton } from "@/components/auth/SignInButton";
import { AppTopBar } from "@/components/layout/AppTopBar";
import { useGreeting } from "@/lib/greetings";
import { BottomNav } from "@/components/nav/BottomNav";
import { TokenIcon } from "@/components/TokenIcon";
import { KitIcon } from "@/components/kit/KitIcon";
import { BannerRotator } from "@/components/banners/BannerRotator";
import { FeaturedBanner } from "@/components/banners/FeaturedBanner";
import { trackBannerImpression } from "@/lib/banners/analytics";
import { getBannerSurface, getQuickActions, useAppConfig } from "@/lib/config/appConfig";
import { ActionIcon } from "@/components/ActionIcon";
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



function HomePage() {
  const { user, incentives, transactions, loading } = useAccountData();
  const { greeting, next: nextGreeting, canCycle } = useGreeting();
  const config = useAppConfig();
  const campaigns = useMemo(() => getBannerSurface(config, "home"), [config]);
  const quickActions = useMemo(() => getQuickActions(config), [config]);
  const campaignSlides = config.flags.showBanners ? campaigns.slides : [];

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
      <AppTopBar
        eyebrow={greeting}
        onEyebrowClick={canCycle ? nextGreeting : undefined}
        title={user?.displayName || user?.email?.split("@")[0] || "Welcome to FlowBridge"}
        avatar={user?.photoURL ?? null}
        initial={(user?.displayName || user?.email || "G").slice(0, 1).toUpperCase()}
        actions={
          <Link
            to="/"
            aria-label="Trade"
            className="grid h-10 w-10 place-items-center rounded-2xl border border-hairline bg-card text-muted transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </Link>
        }
      />

      <main className="mx-auto max-w-2xl space-y-4 p-3 sm:p-4">
        {/* Summary — gradient glass hero balance card */}
        <section className="fb-hero fb-hero-home p-5">
          <KitIcon
            name="flowbridge"
            size={132}
            className="pointer-events-none absolute -right-6 -top-8 opacity-20"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-white/10 blur-2xl"
          />
          <div className="relative flex items-start justify-between gap-3">
            <p className="font-mono text-[10px] font-black uppercase tracking-[0.18em] opacity-80">
              FLOW balance
            </p>
            <Link
              to="/rewards"
              className="inline-flex min-h-[32px] items-center gap-1 rounded-full bg-white/20 px-3 font-mono text-[10px] font-black uppercase tracking-[0.1em] transition-colors hover:bg-white/30"
            >
              Rewards <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>

          <p className="relative mt-2 font-mono text-[40px] font-black leading-none tabular-nums tracking-[-0.02em] sm:text-[46px]">
            {loading && !incentives ? "—" : flowPoints.toLocaleString("en-US")}
            <span className="ml-2 align-baseline text-[13px] font-black opacity-80">FLOW</span>
          </p>

          <div className="relative mt-4 grid grid-cols-2 gap-2">
            <div className="fb-hero-tile flex items-center gap-2 px-3 py-2.5">
              <KitIcon name="gift" size={26} />
              <span className="min-w-0">
                <span className="block font-mono text-[9.5px] font-black uppercase tracking-[0.14em] opacity-80">
                  Claimable
                </span>
                <span className="block font-mono text-[15px] font-black tabular-nums">
                  {claimable.toLocaleString("en-US")}
                </span>
              </span>
            </div>
            <div className="fb-hero-tile flex items-center gap-2 px-3 py-2.5">
              <KitIcon name="bolt" size={26} />
              <span className="min-w-0">
                <span className="block font-mono text-[9.5px] font-black uppercase tracking-[0.14em] opacity-80">
                  Swap volume
                </span>
                <span className="block font-mono text-[15px] font-black tabular-nums">
                  {volumeUsd > 0 ? formatUsd(volumeUsd) : "—"}
                </span>
              </span>
            </div>
          </div>

          {!user && (
            <div className="fb-hero-tile relative mt-4 space-y-2.5 p-3">
              <p className="flex items-start gap-1.5 font-mono text-[10.5px] leading-relaxed">
                <Sparkles className="mt-[1px] h-3 w-3 shrink-0" />
                Sign in to start accruing FLOW on every swap.
              </p>
              <SignInButton label="Sign in" returnTo="/home" />
            </div>
          )}
        </section>


        {/* Quick actions */}
        <section>
          <p className="fb-eyebrow mb-2 px-1">Quick actions</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {quickActions.map((a) => {
              const external = /^https?:\/\//i.test(a.to);
              const bleed = a.iconFit === "cover" && (a.iconKind === "image" || a.iconKind === "kit");
              const inner = (
                <>
                  <span
                    className={`grid h-7 w-7 place-items-center overflow-hidden rounded-lg ${
                      bleed ? "" : "bg-primary/12 p-0 text-primary"
                    }`}
                  >
                    <ActionIcon
                      kind={a.iconKind}
                      name={a.icon}
                      imageUrl={a.imageUrl}
                      fit={a.iconFit}
                      className={bleed ? "h-7 w-7" : "h-4 w-4"}
                    />
                  </span>

                  <span className="min-w-0">
                    <span className="block truncate font-mono text-[11px] font-black uppercase tracking-[0.08em]">
                      {a.label}
                    </span>
                    <span className="block truncate font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
                      {a.hint}
                    </span>
                  </span>
                </>
              );
              const cls =
                "glass-card flex min-h-[76px] flex-col justify-between rounded-[var(--fb-radius-md)] p-3";
              return external ? (
                <a key={a.id} href={a.to} target="_blank" rel="noreferrer" className={cls}>
                  {inner}
                </a>
              ) : (
                <Link key={a.id} to={a.to} hash={a.hash ?? undefined} className={cls}>
                  {inner}
                </Link>
              );
            })}
          </div>
        </section>

        {/* Featured campaign — admin-managed, 4s cross-fade */}
        {campaignSlides.length > 0 && (
          <BannerRotator
            slides={campaignSlides.map((s) => (
              <FeaturedBanner key={s.id} slide={s} surface="home" />
            ))}
            slideKeys={campaignSlides.map((s) => s.id)}
            onSlideVisible={(key) => trackBannerImpression("home", key)}
            intervalMs={campaigns.intervalMs}
            label="Featured campaigns"
            className="pb-1"
          />
        )}


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
                  <TokenIcon symbol={row.symbol} preset="md" />
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
