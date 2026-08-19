import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Compass, Search, Trophy, User2, Wallet2 } from "lucide-react";
import { BottomNav } from "@/components/nav/BottomNav";
import { useCampaignProgress } from "@/lib/campaign/useCampaignProgress";
import { CampaignCard } from "@/components/campaigns/CampaignCard";
import { SkeletonCard } from "@/components/campaigns/CampaignBits";
import {
  campaignChains,
  campaignMetrics,
  chainName,
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
    campaigns,
    authenticated,
    wallet,
    campaignPointsTotal,
    progressFor,
  } = useCampaignProgress();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [chain, setChain] = useState("all");

  const rows = useMemo(
    () =>
      campaigns.map((c) => {
        const progress = progressFor(c.campaignId);
        return {
          campaign: c,
          progress,
          metrics: campaignMetrics(c, progress),
          chains: campaignChains(c),
        };
      }),
    [campaigns, progressFor],
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

  const filtered = searched.filter((r) => {
    if (filter === "live") return r.metrics.isLive;
    if (filter === "ending") return isEndingSoon(r);
    if (filter === "completed") return authenticated && r.metrics.isComplete;
    return true;
  });

  /** Spotlight is a deterministic presentation rule: soonest-ending live campaigns. */
  const spotlight =
    filter === "all" && !q && chain === "all"
      ? [...rows]
          .filter((r) => r.metrics.isLive)
          .sort((a, b) => a.metrics.endsAt - b.metrics.endsAt)
          .slice(0, 2)
      : [];

  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "All", count: searched.length },
    { id: "live", label: "Live", count: searched.filter((r) => r.metrics.isLive).length },
    { id: "ending", label: "Ending soon", count: searched.filter(isEndingSoon).length },
    { id: "completed", label: "Completed", count: completedCount },
  ];


  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-hairline bg-card-alt px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
              <Compass className="h-4 w-4" aria-hidden />
            </span>
            <h1 className="truncate font-mono text-[13px] font-black uppercase tracking-[0.14em]">
              Growth hub<span className="text-primary">.</span>
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Link
              to="/campaigns/me"
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-primary transition-colors hover:bg-primary/16"
            >
              <User2 className="h-3.5 w-3.5" aria-hidden />
              My progress
            </Link>
            <Link
              to="/partners"
              className="inline-flex min-h-[36px] items-center rounded-xl border border-hairline px-3 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-muted transition-colors hover:border-primary/40 hover:text-foreground"
            >
              Partners
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 p-3 sm:p-4">
        {/* Hero */}
        <section className="fb-surface relative overflow-hidden p-4 sm:p-5">
          <span
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary/20 blur-3xl"
          />
          <p className="fb-eyebrow relative">Explore campaigns</p>
          <h2 className="relative mt-1.5 text-[19px] font-black leading-tight sm:text-[22px]">
            Complete verified on-chain quests. Earn Campaign PTS.
          </h2>
          <p className="relative mt-1.5 max-w-xl font-mono text-[10.5px] leading-relaxed text-muted">
            Every campaign task is settled from verified source-chain activity. Campaign PTS is
            tracked separately from FLOW rewards.
          </p>
          <dl className="relative mt-3.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat
              icon={<Trophy className="h-3.5 w-3.5" aria-hidden />}
              label="Campaign PTS"
              value={campaignPointsTotal.toLocaleString("en-US")}
            />
            <Stat
              icon={<Compass className="h-3.5 w-3.5" aria-hidden />}
              label="Completed"
              value={`${completedCount}/${rows.length}`}
            />
            <Stat
              icon={<Wallet2 className="h-3.5 w-3.5" aria-hidden />}
              label="Wallet"
              value={wallet ? shortWallet(wallet) : authenticated ? "Not bound" : "Not signed in"}
            />
          </dl>
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
              className="min-h-[38px] w-full rounded-xl border border-hairline bg-card-alt pl-9 pr-3 font-mono text-[11px] outline-none transition focus:border-primary/60"
            />
          </label>
          <label className="shrink-0">
            <span className="sr-only">Filter by chain</span>
            <select
              value={chain}
              onChange={(e) => setChain(e.target.value)}
              className="min-h-[38px] w-full rounded-xl border border-hairline bg-card-alt px-3 font-mono text-[10px] font-black uppercase tracking-[0.08em] outline-none transition focus:border-primary/60 sm:w-auto"
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
        <div
          role="tablist"
          aria-label="Campaign filters"
          className="flex flex-wrap gap-1.5"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={filter === t.id}
              onClick={() => setFilter(t.id)}
              className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border px-3 font-mono text-[10px] font-black uppercase tracking-[0.1em] transition-colors ${
                filter === t.id
                  ? "border-primary/45 bg-primary/12 text-primary"
                  : "border-hairline text-muted hover:text-foreground"
              }`}
            >
              {t.label}
              <span className="tabular-nums opacity-70">{t.count}</span>
            </button>
          ))}
        </div>

        {/* Spotlight — deterministic: soonest-ending live campaigns */}
        {!loading && !error && spotlight.length > 0 && (
          <section>
            <p className="fb-eyebrow mb-2 px-1">Spotlight · ending soonest</p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {spotlight.map(({ campaign, progress }) => (
                <li key={`spot-${campaign.campaignId}`}>
                  <CampaignCard
                    campaign={campaign}
                    progress={progress}
                    authenticated={authenticated}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}


        {/* All results */}
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : error ? (
          <p className="fb-surface p-4 font-mono text-[10.5px] text-danger">{error}</p>
        ) : filtered.length === 0 ? (
          <div className="fb-surface p-5 text-center">
            <p className="font-mono text-[11px] font-black uppercase tracking-[0.08em]">
              Nothing here yet
            </p>
            <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-muted">
              {filter === "completed"
                ? "Complete a campaign task to see it here."
                : "New campaigns appear as soon as they go live."}
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {filtered.map(({ campaign, progress }) => (
              <li key={campaign.campaignId}>
                <CampaignCard
                  campaign={campaign}
                  progress={progress}
                  authenticated={authenticated}
                />
              </li>
            ))}
          </ul>
        )}

        {!authenticated && (
          <p className="px-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
            Sign in and bind a wallet in Rewards to track campaign progress.
          </p>
        )}
      </main>

      <BottomNav />
    </div>
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
