import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Compass,
  RefreshCw,
  Share2,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";
import { BottomNav } from "@/components/nav/BottomNav";
import { useCampaignProgress } from "@/lib/campaign/useCampaignProgress";
import {
  campaignChains,
  campaignMetrics,
  chainName,
  formatDate,
  shortWallet,
  taskRequirements,
  taskState,
} from "@/components/campaigns/campaignPresentation";
import {
  fetchCampaignMetrics,
  type PublicCampaignMetrics,
} from "@/lib/campaign/campaignMetricsApi";
import {
  CampaignTaskAction,
  CampaignTaskActionSummary,
} from "@/components/campaigns/CampaignTaskAction";
import { resolveCampaignTaskAnyAction } from "@/lib/campaign/campaignAction";
import {
  clearCampaignActionReturn,
  readCampaignActionReturn,
  type CampaignActionReturn,
} from "@/lib/campaign/campaignReturn";
import {
  ChainChip,
  MetricStat,
  DeadlineNote,
  PointsChip,
  ProgressBar,
  SkeletonCard,
  StatusPill,
  TASK_STATE_META,
} from "@/components/campaigns/CampaignBits";
import { CampaignVisual } from "@/components/campaigns/CampaignVisual";

export const Route = createFileRoute("/campaigns/$slug")({
  head: () => ({
    meta: [
      { title: "Campaign Details — FlowBridge Growth Hub" },
      {
        name: "description",
        content:
          "Campaign details, verified task requirements, Campaign PTS rewards and your completion progress on FlowBridge.",
      },
      { property: "og:title", content: "FlowBridge Campaign Details" },
      {
        property: "og:description",
        content: "Verified task requirements, PTS rewards and completion progress.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CampaignDetailPage,
});

function CampaignDetailPage() {
  const { slug } = Route.useParams();
  const { loading, error, campaigns, authenticated, wallet, progressFor, refresh } =
    useCampaignProgress();

  const campaign = useMemo(
    () => campaigns.find((c) => c.slug === slug),
    [campaigns, slug],
  );
  const progress = campaign ? progressFor(campaign.campaignId) : undefined;
  const metrics = campaign ? campaignMetrics(campaign, progress) : null;
  const chains = campaign ? campaignChains(campaign) : {};
  const complete = authenticated && !!metrics?.isComplete;
  const [publicMetrics, setPublicMetrics] = useState<PublicCampaignMetrics | null>(null);
  const [shared, setShared] = useState(false);

  /**
   * V7 — transient, local "verifying" affordance for a task that was just
   * executed from this campaign. It is read-only: bounded refetching of the
   * existing campaign progress API. Nothing here writes, settles or awards.
   */
  const [pending, setPending] = useState<CampaignActionReturn | null>(null);
  const [pollsLeft, setPollsLeft] = useState(0);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const entry = readCampaignActionReturn();
    if (entry && entry.campaignSlug === slug && entry.txHash) {
      setPending(entry);
      setPollsLeft(5);
    }
  }, [slug]);

  const pendingTaskComplete = !!(
    pending && progress?.tasks.find((t) => t.taskId === pending.taskId)?.completed
  );

  useEffect(() => {
    if (!pending || pollsLeft <= 0 || error) return;
    if (pendingTaskComplete) {
      setPollsLeft(0);
      clearCampaignActionReturn();
      setPending(null);
      return;
    }
    const id = setTimeout(() => {
      setPollsLeft((n) => {
        const next = n - 1;
        if (next <= 0) setTimedOut(true);
        return next;
      });
      void refresh();
    }, 6000);
    return () => clearTimeout(id);
  }, [pending, pollsLeft, error, pendingTaskComplete, refresh]);

  useEffect(() => {
    let alive = true;
    fetchCampaignMetrics(slug)
      .then((m) => alive && setPublicMetrics(m))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [slug]);

  const share = async () => {
    const url = typeof window === "undefined" ? "" : window.location.href;
    const title = campaign?.name ?? "FlowBridge campaign";
    try {
      if (navigator.share) await navigator.share({ title, url });
      else await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {
      /* user dismissed share sheet */
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-hairline bg-card-alt px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center gap-2">
          <Link
            to="/campaigns"
            aria-label="Back to campaigns"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-hairline text-muted transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </Link>
          <h1 className="truncate font-mono text-[12px] font-black uppercase tracking-[0.12em]">
            {campaign?.name ?? "Campaign"}
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 p-3 sm:p-4">
        {loading ? (
          <SkeletonCard />
        ) : error ? (
          <p className="fb-surface p-4 font-mono text-[10.5px] text-danger">{error}</p>
        ) : !campaign || !metrics ? (
          <div className="fb-surface p-5 text-center">
            <p className="font-mono text-[11px] font-black uppercase tracking-[0.08em]">
              Campaign not found
            </p>
            <Link
              to="/campaigns"
              className="mt-3 inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-primary px-4 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-primary-foreground"
            >
              <Compass className="h-3 w-3" aria-hidden /> Explore campaigns
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
            <div className="min-w-0 space-y-4">
              {/* Top */}
              <section className="fb-surface relative overflow-hidden p-4 sm:p-5">
                {/* V9.2 — same campaign presentation definition as card/spotlight */}
                <CampaignVisual campaign={campaign} variant="hero" className="opacity-70" />
                <div className="relative flex flex-wrap items-center gap-1.5">
                  {complete ? (
                    <StatusPill tone="done">
                      <CheckCircle2 className="h-3 w-3" aria-hidden /> Completed
                    </StatusPill>
                  ) : metrics.isLive ? (
                    <StatusPill tone="live">Live</StatusPill>
                  ) : (
                    <StatusPill tone="ended">
                      {metrics.hasEnded ? "Ended" : campaign.status}
                    </StatusPill>
                  )}
                  {chains.source !== undefined && (
                    <ChainChip>{chainName(chains.source)}</ChainChip>
                  )}
                  {chains.destination !== undefined && (
                    <ChainChip>→ {chainName(chains.destination)}</ChainChip>
                  )}
                </div>
                <h2 className="relative mt-2.5 text-[20px] font-black leading-tight sm:text-[24px]">
                  {campaign.name}
                </h2>
                {campaign.description && (
                  <p className="relative mt-2 max-w-2xl font-mono text-[10.5px] leading-relaxed text-muted">
                    {campaign.description}
                  </p>
                )}
                <div className="relative mt-3 flex flex-wrap items-center gap-2">
                  <PointsChip value={metrics.totalPoints} />
                  <DeadlineNote>
                    {metrics.hasEnded
                      ? `Ended ${formatDate(metrics.endsAt)}`
                      : `${metrics.timeRemaining} · ends ${formatDate(metrics.endsAt)}`}
                  </DeadlineNote>
                  <button
                    type="button"
                    onClick={share}
                    className="inline-flex min-h-[32px] items-center gap-1.5 rounded-xl border border-hairline px-3 font-mono text-[9.5px] font-black uppercase tracking-[0.1em] text-muted transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    <Share2 className="h-3 w-3" aria-hidden />
                    {shared ? "Link copied" : "Share"}
                  </button>
                </div>
                {complete && (
                  <p className="fb-fade-in relative mt-3 rounded-xl border border-success/35 bg-success/10 px-3 py-2 font-mono text-[9.5px] font-black uppercase tracking-[0.08em] text-success">
                    Campaign complete — every task verified on the source chain.
                  </p>
                )}
                <div className="relative mt-3">
                  <div className="mb-1 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
                    <span>Overall progress</span>
                    <span className="tabular-nums">
                      {authenticated ? metrics.completedTasks : 0}/{metrics.taskCount} tasks
                    </span>
                  </div>
                  <ProgressBar
                    value={authenticated ? metrics.progress : 0}
                    tone={complete ? "success" : "primary"}
                    label="Overall campaign progress"
                  />
                </div>
              </section>

              {/* Tasks */}
              <section className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <p className="fb-eyebrow">Tasks</p>
                  {authenticated && (
                    <button
                      type="button"
                      onClick={() => {
                        setTimedOut(false);
                        void refresh();
                      }}
                      className="inline-flex min-h-[30px] items-center gap-1.5 rounded-xl border border-hairline px-2.5 font-mono text-[9px] font-black uppercase tracking-[0.1em] text-muted transition-colors hover:border-primary/40 hover:text-foreground"
                    >
                      <RefreshCw className="h-3 w-3" aria-hidden /> Refresh status
                    </button>
                  )}
                </div>
                {pending && !pendingTaskComplete && (
                  <p className="fb-inset px-3 py-2 font-mono text-[9.5px] uppercase leading-relaxed tracking-[0.06em] text-muted">
                    {timedOut
                      ? "Still verifying — refresh later. Final Campaign PTS depend on server verification."
                      : "Verifying your recent bridge — final Campaign PTS depend on server verification."}
                  </p>
                )}
                <ul className="space-y-2.5">
                  {campaign.tasks.map((task) => {
                    const state = taskState(task, progress, authenticated);
                    const meta = TASK_STATE_META[state];
                    const tp = progress?.tasks.find((x) => x.taskId === task.taskId);
                    const limit = Math.max(1, task.completionLimitPerWallet);
                    const pct = Math.min(1, (tp?.completions ?? 0) / limit);
                    const reqs = taskRequirements(task);
                    const action = resolveCampaignTaskAnyAction(task);
                    return (
                      <li key={task.taskId} id={`task-${task.taskId}`}>
                        <article
                          className={`fb-surface fb-fade-in p-3.5 ${
                            state === "completed" ? "ring-1 ring-success/35" : ""
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${
                                state === "completed"
                                  ? "bg-success/15 text-success"
                                  : "bg-primary/12 text-primary"
                              }`}
                            >
                              <meta.Icon className="h-4 w-4" aria-hidden />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <h3 className="min-w-0 text-[13px] font-black leading-tight">
                                  {task.title}
                                </h3>
                                <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
                              </div>
                              {task.description && (
                                <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-muted">
                                  {task.description}
                                </p>
                              )}
                              {reqs.length > 0 && (
                                <ul className="mt-2 flex flex-wrap gap-1.5">
                                  {reqs.map((r) => (
                                    <li key={r}>
                                      <ChainChip>{r}</ChainChip>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <PointsChip value={task.points} />
                          </div>

                          <div className="mt-3">
                            <ProgressBar
                              value={authenticated ? pct : 0}
                              tone={state === "completed" ? "success" : "primary"}
                              label={`${task.title} progress`}
                            />
                            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                              {authenticated ? (
                                <div className="min-w-0 space-y-1">
                                  <CampaignTaskActionSummary
                                    action={action}
                                    task={task}
                                    completions={tp?.completions ?? 0}
                                    limit={limit}
                                  />
                                  <p className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
                                    {(tp?.campaignPoints ?? 0).toLocaleString("en-US")} PTS earned
                                  </p>
                                </div>
                              ) : (
                                <p className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
                                  Sign in to track this task
                                </p>
                              )}
                              <CampaignTaskAction
                                campaign={campaign}
                                task={task}
                                action={action}
                                completed={state === "completed"}
                                started={(tp?.completions ?? 0) > 0}
                                verifying={
                                  !!pending &&
                                  pending.taskId === task.taskId &&
                                  state !== "completed" &&
                                  pollsLeft > 0
                                }
                              />
                            </div>
                          </div>
                        </article>
                      </li>
                    );
                  })}
                </ul>
              </section>

              {/* Community metrics + recent verified completions */}
              <section className="fb-surface overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-2.5">
                  <p className="fb-eyebrow">Community activity</p>
                  <span className="inline-flex items-center gap-1.5 font-mono text-[9px] font-black uppercase tracking-[0.1em] text-success">
                    <ShieldCheck className="h-3 w-3" aria-hidden /> Verified on-chain data
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
                  <MetricStat
                    label="Participants"
                    value={(publicMetrics?.participants ?? 0).toLocaleString("en-US")}
                    icon={<Users className="h-3.5 w-3.5" aria-hidden />}
                  />
                  <MetricStat
                    label="Completions"
                    value={(publicMetrics?.completions ?? 0).toLocaleString("en-US")}
                  />
                  <MetricStat
                    label="PTS awarded"
                    value={(publicMetrics?.pointsAwarded ?? 0).toLocaleString("en-US")}
                    icon={<Trophy className="h-3.5 w-3.5" aria-hidden />}
                  />
                </div>
                <ul className="divide-y divide-hairline border-t border-hairline">
                  {(publicMetrics?.recentCompletions ?? []).slice(0, 6).map((r, i) => (
                    <li
                      key={`${r.completedAt}-${r.taskId}-${i}`}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
                    >
                      <span className="min-w-0 font-mono text-[10px] font-black uppercase tracking-[0.06em]">
                        {r.wallet}
                        <span className="ml-2 truncate font-normal normal-case tracking-normal text-muted">
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
                  {(publicMetrics?.recentCompletions ?? []).length === 0 && (
                    <li className="px-4 py-3 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
                      No verified completions recorded yet.
                    </li>
                  )}
                </ul>
              </section>
            </div>

            {/* Summary panel */}
            <aside className="space-y-2.5 lg:sticky lg:top-20 lg:self-start">
              <section className="fb-surface p-4">
                <p className="fb-eyebrow">Your summary</p>
                <dl className="mt-2.5 space-y-2.5">
                  <SummaryRow
                    label="Campaign PTS earned"
                    value={`${(progress?.campaignPoints ?? 0).toLocaleString("en-US")} PTS`}
                    icon={<Trophy className="h-3.5 w-3.5" aria-hidden />}
                  />
                  <SummaryRow
                    label="Tasks completed"
                    value={`${authenticated ? metrics.completedTasks : 0} / ${metrics.taskCount}`}
                  />
                  <SummaryRow
                    label="Total reward"
                    value={`${metrics.totalPoints.toLocaleString("en-US")} PTS`}
                  />
                  <SummaryRow label="Ends" value={formatDate(metrics.endsAt)} />
                  <SummaryRow
                    label="Wallet"
                    value={
                      wallet ? shortWallet(wallet) : authenticated ? "Not bound" : "Not signed in"
                    }
                  />
                </dl>
                {!wallet && (
                  <Link
                    to="/earn"
                    className="mt-3 inline-flex min-h-[36px] w-full items-center justify-center rounded-xl border border-hairline font-mono text-[10px] font-black uppercase tracking-[0.1em] text-muted transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {authenticated ? "Bind wallet" : "Sign in"}
                  </Link>
                )}
              </section>
              <p className="px-1 font-mono text-[9px] uppercase leading-relaxed tracking-[0.08em] text-muted">
                Campaign PTS is separate from FLOW rewards.
              </p>
            </aside>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

function SummaryRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
        {icon && <span className="text-primary">{icon}</span>}
        {label}
      </dt>
      <dd className="shrink-0 font-mono text-[11px] font-black tabular-nums">{value}</dd>
    </div>
  );
}
