import { Link } from "@tanstack/react-router";
import { ArrowUpRight, CheckCircle2, Layers, Sparkles } from "lucide-react";
import type { CampaignApiCampaign, CampaignApiProgress } from "@/lib/campaign/campaignApi";
import {
  campaignChains,
  campaignMetrics,
  chainName,
  formatDate,
} from "./campaignPresentation";
import { resolveCampaignTaskAction } from "@/lib/campaign/campaignAction";
import { ChainChip, DeadlineNote, PointsChip, ProgressBar, StatusPill } from "./CampaignBits";

export function CampaignCard({
  campaign,
  progress,
  authenticated,
}: {
  campaign: CampaignApiCampaign;
  progress?: CampaignApiProgress;
  authenticated: boolean;
}) {
  const m = campaignMetrics(campaign, progress);
  const { source, destination } = campaignChains(campaign);
  const complete = authenticated && m.isComplete;
  /** V7: continuity — jump to the first actionable, incomplete task. */
  const actionableTask = complete
    ? undefined
    : campaign.tasks.find(
        (t) =>
          !!resolveCampaignTaskAction(t) &&
          !progress?.tasks.find((x) => x.taskId === t.taskId)?.completed,
      );

  return (
    <article
      className={`fb-surface fb-fade-in relative flex h-full flex-col overflow-hidden p-4 transition-shadow hover:shadow-[0_18px_40px_-28px_rgba(0,0,0,0.75)] ${
        complete ? "ring-1 ring-success/35" : ""
      }`}
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute -right-12 -top-14 h-40 w-40 rounded-full blur-3xl ${
          complete ? "bg-success/20" : "bg-primary/20"
        }`}
      />

      <div className="relative flex flex-wrap items-center gap-1.5">
        {complete ? (
          <StatusPill tone="done">
            <CheckCircle2 className="h-3 w-3" aria-hidden /> Verified complete
          </StatusPill>
        ) : m.isLive ? (
          <StatusPill tone="live">
            <Sparkles className="h-3 w-3" aria-hidden /> Live
          </StatusPill>
        ) : (
          <StatusPill tone="ended">{m.hasEnded ? "Ended" : campaign.status}</StatusPill>
        )}
        {source !== undefined && <ChainChip>{chainName(source)}</ChainChip>}
        {destination !== undefined && <ChainChip>→ {chainName(destination)}</ChainChip>}
      </div>

      <h3 className="relative mt-2.5 text-[15px] font-black leading-tight">{campaign.name}</h3>
      {campaign.description && (
        <p className="relative mt-1 line-clamp-2 font-mono text-[10.5px] leading-relaxed text-muted">
          {campaign.description}
        </p>
      )}

      <div className="relative mt-3 flex flex-wrap items-center gap-2">
        <PointsChip value={m.totalPoints} />
        <span className="inline-flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
          <Layers className="h-3 w-3" aria-hidden />
          {m.taskCount} task{m.taskCount === 1 ? "" : "s"}
        </span>
        <DeadlineNote>
          {m.hasEnded ? `Ended ${formatDate(m.endsAt)}` : m.timeRemaining}
        </DeadlineNote>
      </div>

      <div className="relative mt-3">
        <div className="mb-1 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
          <span>{authenticated ? "Your progress" : "Sign in to track progress"}</span>
          <span className="tabular-nums">
            {authenticated ? `${m.completedTasks}/${m.taskCount}` : `0/${m.taskCount}`}
          </span>
        </div>
        <ProgressBar
          value={authenticated ? m.progress : 0}
          tone={complete ? "success" : "primary"}
          label={`${campaign.name} progress`}
        />
        {authenticated && m.earnedPoints > 0 && (
          <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-success">
            {m.earnedPoints.toLocaleString("en-US")} Campaign PTS earned
          </p>
        )}
      </div>

      <Link
        to="/campaigns/$slug"
        params={{ slug: campaign.slug }}
        hash={actionableTask ? `task-${actionableTask.taskId}` : undefined}
        className="relative mt-3.5 inline-flex min-h-[38px] w-fit items-center gap-1.5 rounded-full bg-primary px-4 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-primary-foreground transition-transform hover:scale-[1.02] active:scale-[0.99]"
      >
        {complete ? "View details" : authenticated && m.completedTasks > 0 ? "Continue" : "View campaign"}
        <ArrowUpRight className="h-3 w-3" aria-hidden />
      </Link>
    </article>
  );
}
