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

import { BannerRotator } from "@/components/banners/BannerRotator";
import { FeaturedBanner } from "@/components/banners/FeaturedBanner";
import { trackBannerImpression } from "@/lib/banners/analytics";
import { getBannerSurface, getPage, pageLabel, useAppConfig } from "@/lib/config/appConfig";
import { HeroCard } from "@/components/layout/HeroCard";
import { useAccountData } from "@/lib/app/useAccountData";
import { fetchBotChainMarkets, type MarketRow } from "@/lib/markets/marketFeed";
import { formatUsd } from "@/lib/format";
import { GrowthHubModule } from "@/components/app/GrowthHubModule";
import { CampaignPtsPill } from "@/components/app/CampaignPtsPill";
import { RewardsHeroContent } from "@/components/rewards/RewardsHeroContent";
import { useRewardState } from "@/lib/rewards/useRewardState";
import { OpportunityFeed } from "@/components/home/OpportunityFeed";



export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [
      { title: "Home — FlowBridge" },
      {
        name: "description",
        content:
          "Your FlowBridge home: FLOW Points (PTS), recent swap and bridge activity, live BOT Chain prices and one-tap access to swap, bridge and rewards.",
      },
      { property: "og:title", content: "Home — FlowBridge" },
      { property: "og:description", content: "Your FlowBridge home: FLOW Points (PTS), recent swap and bridge activity, live BOT Chain prices and one-tap access to swap, bridge and rewards." },
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
  /**
   * V10 — Home is a personal summary surface, not a link dashboard, so the
   * quick-action grid was removed entirely. Every destination it re-linked is
   * owned by the global navigation or by Explore.
   */

  const page = getPage(config, "home");
  const L = (slot: string, fallback: string) => pageLabel(config, "home", slot, fallback);
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
  /**
   * V12.4C — the claim unit is FLOW (the token), never PTS. `claimableTotal` is
   * the server-computed FLOW payout delta and `claimedTokens` the lifetime paid
   * amount; both come straight from /api/users/incentives.
   */
  const claimableFlow = Number(incentives?.claimableTotal ?? 0);
  const claimedFlow = Number(incentives?.claimedTokens ?? 0);
  const pointsToday = Number(incentives?.flowPointsToday ?? 0);
  const corePointsToday = Number(incentives?.coreSwapPointsToday ?? 0);
  const dailyCap = Number(incentives?.dailyCoreSwapCap ?? 1000);

  const recent = useMemo(() => transactions.slice(0, 4), [transactions]);

  /**
   * V17.1B §2/§8 — the canonical reward state is the single authority for the
   * claim/convert wording in the hero. Home never recomputes claimability.
   */
  const { rewardState } = useRewardState(!!user);

  /**
   * Real verified swap volume, server-computed on the profile
   * (`total_swap_volume_usd`) and returned by /api/users/incentives.
   */
  const volumeUsd = Number(
    incentives?.totalSwapVolumeUsd ?? incentives?.total_swap_volume_usd ?? 0,
  );


  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppTopBar
        eyebrow={page.hero.eyebrow || greeting}
        onEyebrowClick={canCycle ? nextGreeting : undefined}
        title={page.hero.title || user?.displayName || user?.email?.split("@")[0] || "Welcome to FlowBridge"}
        avatar={user?.photoURL ?? null}
        initial={(user?.displayName || user?.email || "G").slice(0, 1).toUpperCase()}
        actions={
          <>
          <CampaignPtsPill />
          <Link
            to="/"
            aria-label="Trade"
            className="grid h-10 w-10 place-items-center rounded-2xl border border-hairline bg-card text-muted transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </Link>
          </>
        }
      />

      <main
        className="mx-auto w-full max-w-2xl space-y-4 px-3 pt-3 sm:px-4 sm:pt-4 md:max-w-4xl md:pt-6"
        style={{ paddingBottom: "calc(84px + env(safe-area-inset-bottom, 0px))" }}
      >
        {/* Summary — compact on mobile so the fold shows real content. */}
        <HeroCard hero={page.hero} variant="home" className="p-3.5 sm:p-5">
          <RewardsHeroContent
            label={L("balance", "FLOW Points")}
            ctaLabel={L("rewardsCta", "Earn & Claim")}
            loading={loading}
            hasData={!!incentives}
            flowPoints={flowPoints}
            pointsToday={pointsToday}
            corePointsToday={corePointsToday}
            dailyCap={dailyCap}
            claimableFlow={claimableFlow}
            claimedFlow={claimedFlow}
            volumeUsd={volumeUsd}
            rewardState={rewardState}
          />



          {!user && (
            <div className="fb-hero-tile relative mt-4 space-y-2.5 p-3">
              <p className="flex items-start gap-1.5 font-mono text-[10.5px] leading-relaxed">
                <Sparkles className="mt-[1px] h-3 w-3 shrink-0" />
                Sign in to start accruing FLOW Points (PTS) on every swap.
              </p>
              <SignInButton label="Sign in" returnTo="/home" />
            </div>
          )}
        </HeroCard>

        {/* V16 — Flow AI proactive insights, evidence-backed and read-only */}
        <OpportunityFeed />




        {/*
         * V10 — the Quick actions grid is gone: it was a dashboard-of-links that
         * duplicated global navigation. Everything it linked to has a real owner
         * (Trade, Explore, Activity, Profile, Markets).
         */}


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


        {/* Growth Hub module — existing /api/campaigns data only */}
        <GrowthHubModule />

        {/* Markets snapshot */}
        <section className="fb-surface overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
            <p className="fb-eyebrow">{L("markets", "BOT Chain prices")}</p>
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
            <p className="fb-eyebrow">{L("activity", "Recent activity")}</p>
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
