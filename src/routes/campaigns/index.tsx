import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowUpRight, Compass, RefreshCw, Search, Sparkles, Trophy, Wallet2 } from "lucide-react";
import { BottomNav } from "@/components/nav/BottomNav";
import { AppTopBar } from "@/components/layout/AppTopBar";
import { useCampaignProgress } from "@/lib/campaign/useCampaignProgress";
import { CampaignCard } from "@/components/campaigns/CampaignCard";
import { CampaignArt } from "@/components/campaigns/CampaignArt";
import { SkeletonCard } from "@/components/campaigns/CampaignBits";
import {
  campaignChains,
  campaignCover,
  campaignMetrics,
  chainName,
  dedupeCampaigns,
  shortWallet,
} from "@/components/campaigns/campaignPresentation";

export const Route = createFileRoute("/campaigns/")({
  head: () => ({
    meta: [
      { title: "Campaign Growth Hub — FlowBridge Quests & Campaign PTS" },
      {
        name: "description",
        content:
          "Explore live FlowBridge campaigns on BOT Chain, complete verified bridge quests and track your Campaign PTS progress in one polished hub.",
      },
      { property: "og:title", content: "FlowBridge Campaign Growth Hub" },
      {
        property: "og:description",
        content: "Live BOT Chain campaigns, verified bridge tasks and Campaign PTS progress.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://flowbridge.space/campaigns" }],
  }),
  component: CampaignsPage,
});

type Filter = "all" | "live" | "ending" | "completed";

const ENDING_SOON_MS = 7 * 86_400_000;

function CampaignsPage() {
  const {
    loading,
    error,
    progressUnavailable,
    campaigns,
    authenticated,
    wallet,
    campaignPointsTotal,
    progressFor,
    refresh,
  } = useCampaignProgress();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [chain, setChain] = useState("all");

  /** V9.1: never render the same campaign twice, even if the API repeats a row. */
  const unique = useMemo(() => dedupeCampaigns(campaigns), [campaigns]);

  const rows = useMemo(
    () =>
      unique.map((c) => {
        const progress = progressFor(c.campaignId);
        return {
          campaign: c,
          progress,
          metrics: campaignMetrics(c, progress),
          chains: campaignChains(c),
        };
      }),
    [unique, progressFor],
  );

  const chainOptions = useMemo(() => {
    const ids = new Set<number>();
    rows.forEach((r) => {
      if (r.chains.source !== undefined) ids.add(r.chains.source);
      if (r.chains.destination !== undefined) ids.add(r.chains.destination);
    });
    return [...ids].sort((a, b) => a - b);
  }, [rows]);

  const completedCount = rows.filter((r) => authenticated && r.metrics.isComplete).length;
  const isEndingSoon = (r: (typeof rows)[number]) =>
    r.metrics.isLive && r.metrics.endsAt - Date.now() <= ENDING_SOON_MS;

  const q = query.trim().toLowerCase();
  const searched = rows.filter((r) => {
    const matchesQuery =
      !q ||
      [r.campaign.name, r.campaign.slug, r.campaign.description ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    const matchesChain =
      chain === "all" ||
      String(r.chains.source) === chain ||
      String(r.chains.destination) === chain;
    return matchesQuery && matchesChain;
  });

  const browsing = filter === "all" && !q && chain === "all";

  /** Featured is deterministic: the soonest-ending live campaign. */
  const featured = browsing
    ? [...rows].filter((r) => r.metrics.isLive).sort((a, b) => a.metrics.endsAt - b.metrics.endsAt)[0]
    : undefined;

  const filtered = searched
    .filter((r) => {
      if (filter === "live") return r.metrics.isLive;
      if (filter === "ending") return isEndingSoon(r);
      if (filter === "completed") return authenticated && r.metrics.isComplete;
      return true;
    })
    // Featured is excluded from the grid so nothing shows twice in one viewport.
    .filter((r) => r.campaign.campaignId !== featured?.campaign.campaignId);

  const sections = browsing
    ? [
        { id: "live", title: "Live now", items: filtered.filter((r) => r.metrics.isLive) },
        {
          id: "ending",
          title: "Ending soon",
          items: filtered.filter(isEndingSoon),
        },
        {
          id: "yours",
          title: "Your progress",
          items: authenticated ? filtered.filter((r) => r.metrics.completedTasks > 0) : [],
        },
        {
          id: "rest",
          title: "Everything else",
          items: filtered.filter((r) => !r.metrics.isLive),
        },
      ].filter((s) => s.items.length > 0)
    : [{ id: "results", title: "Results", items: filtered }];

  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "All", count: searched.length },
    { id: "live", label: "Live", count: searched.filter((r) => r.metrics.isLive).length },
    { id: "ending", label: "Ending soon", count: searched.filter(isEndingSoon).length },
    { id: "completed", label: "Completed", count: completedCount },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppTopBar eyebrow="Explore" title="Campaign Growth Hub" />

      <main className="mx-auto max-w-2xl space-y-5 p-3 sm:p-4 md:max-w-4xl lg:max-w-[1240px] lg:py-6">
        {/* Hero */}
        <section className="fb-surface relative overflow-hidden p-4 sm:p-5 lg:p-6">
          <span
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary/20 blur-3xl"
          />
          <div className="relative lg:flex lg:items-end lg:justify-between lg:gap-8">
            <div className="min-w-0">
              <p className="fb-eyebrow">Explore campaigns</p>
              <h1 className="mt-1.5 text-[21px] font-black leading-tight tracking-[-0.02em] sm:text-[26px] lg:text-[30px]">
                Complete verified on-chain quests. Earn Campaign PTS.
              </h1>
              <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-muted">
                Every campaign task settles from verified source-chain activity. Campaign PTS is
                tracked separately from FLOW rewards.
              </p>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2 lg:mt-0 lg:w-[420px] lg:shrink-0 lg:grid-cols-3">
              <Stat
                icon={<Trophy className="h-3.5 w-3.5" aria-hidden />}
                label="Campaign PTS"
                value={authenticated ? campaignPointsTotal.toLocaleString("en-US") : "—"}
              />
              <Stat
                icon={<Compass className="h-3.5 w-3.5" aria-hidden />}
                label="Completed"
                value={authenticated ? `${completedCount}/${rows.length}` : `—/${rows.length}`}
              />
              <Stat
                icon={<Wallet2 className="h-3.5 w-3.5" aria-hidden />}
                label="Wallet"
                value={
                  wallet ? shortWallet(wallet) : authenticated ? "Not bound" : "Not signed in"
                }
              />
            </dl>
          </div>
        </section>

        {/* Search + chain filter */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search campaigns</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search campaigns"
              className="min-h-[40px] w-full rounded-xl border border-hairline bg-card-alt pl-9 pr-3 text-[13px] outline-none transition focus:border-primary/60"
            />
          </label>
          <label className="shrink-0">
            <span className="sr-only">Filter by chain</span>
            <select
              value={chain}
              onChange={(e) => setChain(e.target.value)}
              className="min-h-[40px] w-full rounded-xl border border-hairline bg-card-alt px-3 text-[12.5px] font-bold outline-none transition focus:border-primary/60 sm:w-auto"
            >
              <option value="all">All chains</option>
              {chainOptions.map((id) => (
                <option key={id} value={String(id)}>
                  {chainName(id)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Filters */}
        <div role="tablist" aria-label="Campaign filters" className="flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={filter === t.id}
              onClick={() => setFilter(t.id)}
              className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-full border px-3.5 text-[12px] font-bold transition-colors ${
                filter === t.id
                  ? "border-primary/45 bg-primary/12 text-primary"
                  : "border-hairline text-muted hover:text-foreground"
              }`}
            >
              {t.label}
              <span className="font-mono text-[10.5px] tabular-nums opacity-70">{t.count}</span>
            </button>
          ))}
        </div>

        {/* Featured — materially distinct from the grid */}
        {!loading && !error && featured && (
          <FeaturedCampaign row={featured} authenticated={authenticated} />
        )}

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : error ? (
          <div className="fb-surface p-5">
            <p className="text-[13px] font-bold text-danger">Couldn’t load campaigns</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">{error}</p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-3 inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-hairline px-3.5 text-[12px] font-bold text-foreground transition-colors hover:border-primary/40"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Try again
            </button>
          </div>
        ) : filtered.length === 0 && !featured ? (
          <div className="fb-surface p-6 text-center">
            <p className="text-[13.5px] font-black">Nothing here yet</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
              {filter === "completed"
                ? "Complete a campaign task to see it here."
                : "New campaigns appear as soon as they go live."}
            </p>
          </div>
        ) : (
          sections.map((section) => (
            <section key={section.id}>
              <p className="fb-eyebrow mb-2 px-1">{section.title}</p>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {section.items.map(({ campaign, progress }) => (
                  <li key={`${section.id}-${campaign.campaignId}`}>
                    <CampaignCard
                      campaign={campaign}
                      progress={progress}
                      authenticated={authenticated}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}

        {progressUnavailable && (
          <p className="px-1 text-[12px] text-muted">
            Sign in again to track your personal campaign progress — public campaign discovery is
            unaffected.
          </p>
        )}
        {!authenticated && !progressUnavailable && (
          <p className="px-1 text-[12px] text-muted">
            Sign in and bind a wallet in Rewards to track campaign progress.
          </p>
        )}

        <div className="flex flex-wrap gap-2 px-1 pb-2">
          <Link
            to="/campaigns/me"
            className="inline-flex min-h-[36px] items-center rounded-full border border-hairline px-3.5 text-[12px] font-bold text-muted transition-colors hover:border-primary/40 hover:text-foreground"
          >
            My progress
          </Link>
          <Link
            to="/partners"
            className="inline-flex min-h-[36px] items-center rounded-full border border-hairline px-3.5 text-[12px] font-bold text-muted transition-colors hover:border-primary/40 hover:text-foreground"
          >
            Partners
          </Link>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}

function FeaturedCampaign({
  row,
  authenticated,
}: {
  row: {
    campaign: import("@/lib/campaign/campaignApi").CampaignApiCampaign;
    metrics: ReturnType<typeof campaignMetrics>;
    chains: { source?: number; destination?: number };
  };
  authenticated: boolean;
}) {
  const { campaign, metrics, chains } = row;
  const cover = campaignCover(campaign);

  return (
    <section className="overflow-hidden rounded-[var(--fb-radius-lg,20px)] border border-hairline bg-card lg:grid lg:grid-cols-12">
      <CampaignArt campaign={campaign} className="h-40 lg:col-span-5 lg:h-full" />
      <div className="p-4 sm:p-5 lg:col-span-7 lg:p-6">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2.5 py-1 text-[11px] font-bold text-primary">
            <Sparkles className="h-3 w-3" aria-hidden /> Featured
          </span>
          <span className="rounded-full border border-hairline px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
            {cover.category}
          </span>
          {chains.source !== undefined && (
            <span className="rounded-full border border-hairline px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
              {chainName(chains.source)}
              {chains.destination !== undefined ? ` → ${chainName(chains.destination)}` : ""}
            </span>
          )}
        </div>

        <h2 className="mt-2.5 text-[19px] font-black leading-tight tracking-[-0.02em] lg:text-[24px]">
          {campaign.name}
        </h2>
        {campaign.description && (
          <p className="mt-1.5 line-clamp-3 text-[12.5px] leading-relaxed text-muted">
            {campaign.description}
          </p>
        )}

        <dl className="mt-3.5 flex flex-wrap gap-x-6 gap-y-2">
          <div>
            <dt className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">Reward</dt>
            <dd className="font-mono text-[15px] font-black tabular-nums text-primary">
              {metrics.totalPoints.toLocaleString("en-US")} PTS
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">Tasks</dt>
            <dd className="font-mono text-[15px] font-black tabular-nums">{metrics.taskCount}</dd>
          </div>
          <div>
            <dt className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">State</dt>
            <dd className="font-mono text-[15px] font-black">{metrics.timeRemaining}</dd>
          </div>
          {authenticated && (
            <div>
              <dt className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
                Your progress
              </dt>
              <dd className="font-mono text-[15px] font-black tabular-nums">
                {metrics.completedTasks}/{metrics.taskCount}
              </dd>
            </div>
          )}
        </dl>

        <Link
          to="/campaigns/$slug"
          params={{ slug: campaign.slug }}
          className="mt-4 inline-flex min-h-[42px] items-center gap-1.5 rounded-full bg-primary px-5 text-[13px] font-bold text-primary-foreground transition-transform hover:scale-[1.02] active:scale-[0.99]"
        >
          {authenticated && metrics.completedTasks > 0 ? "Continue campaign" : "Start campaign"}
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="fb-inset min-w-0 p-2.5">
      <dt className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
        <span className="text-primary">{icon}</span>
        {label}
      </dt>
      <dd className="mt-1 truncate font-mono text-[13px] font-black tabular-nums">{value}</dd>
    </div>
  );
}
