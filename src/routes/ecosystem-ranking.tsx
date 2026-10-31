/** Public: live BOT Chain Ecosystem Ranking with FlowBridge pinned and one-tap voting. */
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Search, Trophy, ExternalLink } from "lucide-react";
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
  const data = useSuspenseQuery(rankingQuery).data;
  const fb = data.flowbridge;
  const votes = fb?.weeklyVoteCount ?? 0;
  const rank = fb?.weeklyRankNo ?? null;

  return (
    <div className="min-h-screen bg-background pb-24 text-foreground">
      <AppTopBar title="Ecosystem Ranking" />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <header>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Trophy className="h-6 w-6 text-primary" />BOT Chain Ecosystem Ranking</h1>
          <p className="mt-1 text-sm text-muted-foreground">Live from BOT Chain{data.periodStart ? ` · ${fmt(data.periodStart)} – ${fmt(data.periodEnd)}` : ""}</p>
        </header>

        {/* FlowBridge always selected in the search bar */}
        <div className="fb-surface flex items-center gap-3 rounded-xl border border-primary/40 p-3" aria-label="Selected project">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          {fb?.logoUrl && <img src={fb.logoUrl} alt="" className="h-8 w-8 rounded-full" />}
          <div className="min-w-0 flex-1">
            <p className="font-semibold">FlowBridge</p>
            <p className="text-xs text-muted-foreground">#{rank ?? "—"} · {votes.toLocaleString()} votes</p>
          </div>
        </div>

        <a href={OFFICIAL} target="_blank" rel="noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-4 text-base font-bold text-primary-foreground shadow-lg">
          Vote for FlowBridge <ExternalLink className="h-4 w-4" />
        </a>
        <p className="-mt-2 text-center text-xs text-muted-foreground">Opens BOT Chain's official page — connect your wallet there to vote.</p>

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
        <p className="text-xs text-muted-foreground">Voting happens on the official BOT Chain page with your own wallet. Data provided by BOT Chain.</p>
      </main>
      <BottomNav />
    </div>
  );
}
