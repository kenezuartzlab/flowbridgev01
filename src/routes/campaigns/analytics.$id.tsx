import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useAccount, WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";
import {
  ArrowLeft,
  BarChart3,
  Download,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";
import { initAuth } from "@/lib/auth";
import { checkAdmin } from "@/lib/admin/adminApi";
import { BottomNav } from "@/components/nav/BottomNav";
import {
  MetricStat,
  MiniBarChart,
  ProgressBar,
  SkeletonCard,
  StatusPill,
} from "@/components/campaigns/CampaignBits";
import { formatDate } from "@/components/campaigns/campaignPresentation";
import {
  downloadCampaignAnalyticsCsv,
  fetchCampaignAnalytics,
  type AdminCampaignAnalytics,
} from "@/lib/campaign/campaignMetricsApi";

export const Route = createFileRoute("/campaigns/analytics/$id")({
  head: () => ({
    meta: [
      { title: "Campaign Analytics — FlowBridge" },
      {
        name: "description",
        content:
          "Operator-only FlowBridge campaign analytics: participants, completions, Campaign PTS awarded and verified activity volume from authoritative data.",
      },
      { property: "og:title", content: "Campaign Analytics — FlowBridge" },
      { property: "og:description", content: "Operator-only FlowBridge campaign analytics: participants, completions, Campaign PTS awarded and verified activity volume from authoritative data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AnalyticsRoute,
});

function AnalyticsRoute() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <AnalyticsPage />
    </WagmiProvider>
  );
}

function AnalyticsPage() {
  const { id } = Route.useParams();
  const { address } = useAccount();
  const wallet = address?.toLowerCase();

  const [user, setUser] = useState<unknown>(null);
  const [authReady, setAuthReady] = useState(false);
  const [gate, setGate] = useState<{ isAdmin: boolean; reason?: string } | null>(null);
  const [data, setData] = useState<AdminCampaignAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const un = initAuth(
      (u) => {
        setUser(u);
        setAuthReady(true);
      },
      () => {
        setUser(null);
        setAuthReady(true);
      },
    );
    return () => un();
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (!user || !wallet) {
      setGate({
        isAdmin: false,
        reason: !user ? "Sign in with your operator account." : "Connect the bound admin wallet.",
      });
      return;
    }
    let alive = true;
    void checkAdmin(wallet).then((r) => alive && setGate(r));
    return () => {
      alive = false;
    };
  }, [authReady, user, wallet]);

  const reload = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    setError(null);
    try {
      setData(await fetchCampaignAnalytics(wallet, id));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [wallet, id]);

  useEffect(() => {
    if (gate?.isAdmin) void reload();
  }, [gate?.isAdmin, reload]);

  const exportCsv = async () => {
    if (!wallet) return;
    setBusy(true);
    setError(null);
    try {
      await downloadCampaignAnalyticsCsv(wallet, id);
    } catch (e: any) {
      setError(e?.message ?? "Export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-hairline bg-card-alt px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center gap-2">
          <Link
            to="/sets"
            search={{ section: "campaigns" as const }}
            aria-label="Back to Campaign Studio"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-hairline text-muted transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </Link>
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
            <BarChart3 className="h-4 w-4" aria-hidden />
          </span>
          <h1 className="min-w-0 flex-1 truncate font-mono text-[12px] font-black uppercase tracking-[0.12em]">
            {data?.name ?? "Campaign analytics"}
          </h1>
          {gate?.isAdmin && (
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => void reload()}
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-hairline px-3 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-muted transition hover:border-primary/40 hover:text-foreground"
              >
                <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} aria-hidden />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              <button
                type="button"
                disabled={busy || !data}
                onClick={() => void exportCsv()}
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl bg-primary px-3 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                ) : (
                  <Download className="h-3 w-3" aria-hidden />
                )}
                CSV
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="fb-fade-in mx-auto max-w-4xl space-y-4 p-3 sm:p-4">
        {!gate ? (
          <SkeletonCard />
        ) : !gate.isAdmin ? (
          <section className="fb-surface p-5 text-center">
            <p className="font-mono text-[11px] font-black uppercase tracking-[0.08em]">
              Operators only
            </p>
            <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-muted">
              {gate.reason ?? "This console is restricted to authorized campaign operators."}
            </p>
          </section>
        ) : loading && !data ? (
          <SkeletonCard />
        ) : error ? (
          <p className="fb-surface p-4 font-mono text-[10.5px] text-danger">{error}</p>
        ) : !data ? (
          <p className="fb-surface p-4 font-mono text-[10.5px] text-muted">Campaign not found.</p>
        ) : (
          <>
            <section className="fb-surface relative overflow-hidden p-4 sm:p-5">
              <span
                aria-hidden
                className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary/20 blur-3xl"
              />
              <div className="relative flex flex-wrap items-center gap-1.5">
                <StatusPill tone={data.status === "published" ? "live" : "ended"}>
                  {data.status}
                </StatusPill>
                <span className="inline-flex items-center gap-1.5 font-mono text-[9px] font-black uppercase tracking-[0.1em] text-success">
                  <ShieldCheck className="h-3 w-3" aria-hidden /> Read-only authoritative data
                </span>
              </div>
              <h2 className="relative mt-2.5 text-[18px] font-black leading-tight sm:text-[21px]">
                {data.name}
              </h2>
              <p className="relative mt-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
                {formatDate(new Date(data.startsAt).getTime())} →{" "}
                {formatDate(new Date(data.endsAt).getTime())} · /{data.slug}
              </p>
              <dl className="relative mt-3.5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                <MetricStat
                  label="Participants"
                  value={data.participants.toLocaleString("en-US")}
                  icon={<Users className="h-3.5 w-3.5" aria-hidden />}
                />
                <MetricStat
                  label="Completions"
                  value={data.completions.toLocaleString("en-US")}
                />
                <MetricStat
                  label="PTS awarded"
                  value={data.pointsAwarded.toLocaleString("en-US")}
                  hint={`of ${data.configuredPoints.toLocaleString("en-US")} configured / wallet`}
                  icon={<Trophy className="h-3.5 w-3.5" aria-hidden />}
                />
                <MetricStat
                  label="Verified activities"
                  value={data.verifiedActivities.toLocaleString("en-US")}
                />
              </dl>
              {data.completionRate !== null && (
                <div className="relative mt-3">
                  <div className="mb-1 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
                    <span>Completion rate (participants × task capacity)</span>
                    <span className="tabular-nums">
                      {(data.completionRate * 100).toFixed(1)}%
                    </span>
                  </div>
                  <ProgressBar value={data.completionRate} label="Completion rate" />
                </div>
              )}
            </section>

            <section className="fb-surface grid gap-5 p-4 sm:grid-cols-2">
              <MiniBarChart
                label="Completions over time"
                data={data.series.map((p) => ({ date: p.date, value: p.completions }))}
              />
              <MiniBarChart
                label="Campaign PTS awarded over time"
                tone="success"
                data={data.series.map((p) => ({ date: p.date, value: p.points }))}
              />
            </section>

            <section className="fb-surface overflow-hidden">
              <div className="border-b border-hairline px-4 py-2.5">
                <p className="fb-eyebrow">Task performance</p>
              </div>
              <ul className="divide-y divide-hairline">
                {data.tasks.map((t) => (
                  <li key={t.taskId} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="min-w-0 truncate font-mono text-[10.5px] font-black uppercase tracking-[0.06em]">
                        {t.title}
                      </p>
                      <p className="shrink-0 font-mono text-[9.5px] tabular-nums text-muted">
                        {t.completions.toLocaleString("en-US")} completions ·{" "}
                        {t.participants.toLocaleString("en-US")} wallets · {t.points} PTS
                      </p>
                    </div>
                    <div className="mt-2">
                      <ProgressBar
                        value={
                          data.completions ? t.completions / Math.max(1, data.completions) : 0
                        }
                        label={`${t.title} share of completions`}
                      />
                    </div>
                  </li>
                ))}
                {data.tasks.length === 0 && (
                  <li className="px-4 py-3 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
                    No tasks configured.
                  </li>
                )}
              </ul>
            </section>

            <section className="fb-surface overflow-hidden">
              <div className="border-b border-hairline px-4 py-2.5">
                <p className="fb-eyebrow">Recent completions</p>
              </div>
              <ul className="divide-y divide-hairline">
                {data.recentCompletions.map((r, i) => (
                  <li
                    key={`${r.completedAt}-${r.taskId}-${i}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
                  >
                    <span className="min-w-0 font-mono text-[10px] font-black uppercase tracking-[0.06em]">
                      {r.wallet}
                      <span className="ml-2 font-normal normal-case tracking-normal text-muted">
                        {r.taskTitle}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 font-mono text-[9.5px] tabular-nums text-muted">
                      {r.verified && <ShieldCheck className="h-3 w-3 text-success" aria-hidden />}
                      {r.points.toLocaleString("en-US")} PTS ·{" "}
                      {formatDate(new Date(r.completedAt).getTime())}
                    </span>
                  </li>
                ))}
                {data.recentCompletions.length === 0 && (
                  <li className="px-4 py-3 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
                    No completions recorded yet.
                  </li>
                )}
              </ul>
            </section>

            <p className="px-1 font-mono text-[9px] uppercase leading-relaxed tracking-[0.08em] text-muted">
              Analytics are read-only. Nothing here awards PTS, FLOW or completions.
            </p>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
