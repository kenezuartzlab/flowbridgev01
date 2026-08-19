/**
 * App Experience V6 — compact Growth Hub module for the Home command center.
 * Reads only the existing public /api/campaigns data (definitions + server
 * progress). No settlement, no recommendation logic, no fabricated values.
 */
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Compass, Gift } from "lucide-react";
import { ProgressBar } from "@/components/campaigns/CampaignBits";
import { useCampaignProgress } from "@/lib/campaign/useCampaignProgress";

export function GrowthHubModule() {
  const { loading, error, campaigns, authenticated, campaignPointsTotal, progressFor } =
    useCampaignProgress();

  // Deterministic pick: first campaign with an incomplete task, else the first.
  const focus =
    campaigns.find((c) => {
      const p = progressFor(c.campaignId);
      return !p || p.tasks.some((t) => !t.completed);
    }) ?? campaigns[0];
  const focusProgress = focus ? progressFor(focus.campaignId) : undefined;
  const totalTasks = focus?.tasks.length ?? 0;
  const doneTasks = focusProgress?.tasks.filter((t) => t.completed).length ?? 0;

  return (
    <section className="fb-surface overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
            <Compass className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="fb-eyebrow">Growth hub</p>
            <p className="truncate font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">
              Campaign PTS — separate from FLOW
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-xl bg-primary/12 px-2.5 py-1 font-mono text-[10px] font-black tabular-nums text-primary">
          {authenticated ? campaignPointsTotal.toLocaleString("en-US") : "—"} PTS
        </span>
      </div>

      {loading ? (
        <p className="px-4 py-4 font-mono text-[10.5px] text-muted">Loading campaigns…</p>
      ) : error ? (
        <p className="px-4 py-4 font-mono text-[10.5px] text-danger">{error}</p>
      ) : !focus ? (
        <p className="px-4 py-4 font-mono text-[10.5px] text-muted">
          No published campaigns right now.
        </p>
      ) : (
        <div className="space-y-2.5 px-4 py-3.5">
          <div className="flex items-start gap-2.5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
              <Gift className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-[11.5px] font-black uppercase tracking-[0.06em]">
                {focus.name}
              </p>
              <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">
                {authenticated
                  ? `${doneTasks} / ${totalTasks} tasks complete`
                  : "Sign in to track your progress"}
              </p>
            </div>
          </div>
          {authenticated && totalTasks > 0 && (
            <ProgressBar
              value={totalTasks ? doneTasks / totalTasks : 0}
              label="Campaign progress"
            />
          )}
          <div className="flex flex-wrap gap-1.5">
            <Link
              to="/campaigns/$slug"
              params={{ slug: focus.slug }}
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/12 px-3 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-primary transition-colors hover:bg-primary/20"
            >
              Open campaign <ArrowUpRight className="h-3 w-3" aria-hidden />
            </Link>
            <Link
              to="/campaigns"
              className="inline-flex min-h-[34px] items-center rounded-xl border border-hairline px-3 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-muted transition-colors hover:border-primary/40 hover:text-foreground"
            >
              All campaigns
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
