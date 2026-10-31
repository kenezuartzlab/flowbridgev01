/** Public: live BOT Chain Ecosystem Ranking with FlowBridge pinned and one-tap voting. */
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Search, Trophy } from "lucide-react";
import { VoteFlowBridge } from "@/components/ecosystem/VoteFlowBridge";
import { AppTopBar } from "@/components/layout/AppTopBar";
import { BottomNav } from "@/components/nav/BottomNav";
import { getEcosystemRanking, FLOWBRIDGE_PROJECT_ID } from "@/lib/ecosystem/ranking.functions";

const TITLE = "Vote for FlowBridge — BOT Chain Ecosystem Ranking";
const DESC = "See FlowBridge's live BOT Chain Ecosystem Ranking and vote for it directly from FlowBridge.";
const OFFICIAL = "https://www.botchain.ai/en/ecosystem-ranking/";

const rankingQuery = queryOptions({
  queryKey: ["ecosystem-ranking", "weekly"],
  queryFn: () => getEcosystemRanking({ data: { rankType: "weekly" } }),
  staleTime: 60_000,
  refetchInterval: 120_000,
});

export const Route = createFileRoute("/ecosystem-ranking")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://flowbridge.space/ecosystem-ranking" }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(rankingQuery),
  component: RankingPage,
  errorComponent: () => (
    <div className="min-h-screen bg-background text-foreground"><AppTopBar title="Ecosystem Ranking" />
      <main className="mx-auto max-w-2xl p-6 text-center"><p className="text-muted-foreground">BOT Chain ranking is temporarily unavailable.</p>
        <a href={OFFICIAL} target="_blank" rel="noreferrer" className="mt-3 inline-block text-primary">Open official ranking</a></main></div>
  ),
});

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");

function RankingPage() {
  const { data, refetch } = useSuspenseQuery(rankingQuery);
  const fb = data.flowbridge;
  const votes = fb?.weeklyVoteCount ?? 0;
  const rank = fb?.weeklyRankNo ?? null;

  return (
    <div className="min-h-screen bg-background pb-24 text-foreground">
      <AppTopBar title="Ecosystem Ranking" />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        {/* FlowBridge always selected in the search bar */}
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5" aria-label="Selected project">
          <Search className="h-5 w-5 shrink-0 text-foreground" />
          <span className="flex-1 text-base">FlowBridge</span>
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-sm font-bold text-primary">✕</span>
        </div>

        <header className="pt-4">
          <h1 className="text-3xl font-bold tracking-tight">Ecosystem Heat Ranking</h1>
          <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">Ecosystem ranking{data.periodStart ? ` · ${fmt(data.periodStart)} – ${fmt(data.periodEnd)}` : ""}</p>
        </header>

        <section className="relative overflow-hidden rounded-3xl border border-primary/40 bg-gradient-to-br from-card via-card to-primary/20 p-5">
          <div className="flex justify-end">
            <span className="rounded-full bg-primary/15 px-4 py-1.5 text-lg font-medium text-primary">Weekly #{rank ?? "—"}</span>
          </div>
          <div className="mt-2 flex items-center gap-4">
            {fb?.logoUrl ? <img src={fb.logoUrl} alt="" className="h-16 w-16 rounded-full" /> : <span className="h-16 w-16 rounded-full bg-muted" />}
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">DeFi</p>
              <p className="truncate text-2xl font-bold">FlowBridge</p>
            </div>
          </div>
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">Weekly · Votes</p>
            <p className="mt-1 text-4xl font-bold tabular-nums">{votes.toLocaleString()}</p>
          </div>
          <div className="mt-4 border-t border-border pt-4">
            <VoteFlowBridge onVoted={() => void refetch()} />
          </div>
        </section>

        <h2 className="flex items-center gap-2 pt-2 text-lg font-semibold"><Trophy className="h-5 w-5 text-primary" />Overall ranking</h2>

        <ol className="space-y-2">
          {data.list.map((e) => {
            const mine = e.projectId === FLOWBRIDGE_PROJECT_ID;
            return (
              <li key={e.projectId} className={`fb-surface flex items-center gap-3 rounded-xl p-3 ${mine ? "border border-primary" : ""}`}>
                <span className="w-8 text-center font-bold text-muted-foreground">#{e.rankNo}</span>
                {e.logoUrl ? <img src={e.logoUrl} alt="" loading="lazy" className="h-8 w-8 rounded-full" /> : <span className="h-8 w-8 rounded-full bg-muted" />}
                <span className="min-w-0 flex-1 truncate font-medium">{e.projectName}</span>
                <span className="text-sm tabular-nums text-muted-foreground">{e.voteCount.toLocaleString()}</span>
              </li>
            );
          })}
        </ol>
        <p className="text-xs text-muted-foreground">Votes go to BOT Chain's official ranking contract from your own wallet. Data provided by BOT Chain.</p>
      </main>
      <BottomNav />
    </div>
  );
}
