/**
 * Growth Hub V7 — reusable campaign task action primitive.
 * Presentation only: it launches the EXISTING bridge UI with validated route
 * context. It never submits a transaction, never claims eligibility and never
 * writes campaign state.
 */
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Route as RouteIcon, ShieldCheck } from "lucide-react";
import {
  campaignActionLink,
  campaignSwapActionLink,
  type CampaignTaskAnyAction,
} from "@/lib/campaign/campaignAction";
import type { CampaignApiCampaign, CampaignApiTask } from "@/lib/campaign/campaignApi";

export function CampaignTaskAction({
  campaign,
  task,
  action,
  completed,
  started,
  verifying,
}: {
  campaign: CampaignApiCampaign;
  task: CampaignApiTask;
  action: CampaignTaskAnyAction | null;
  completed: boolean;
  started: boolean;
  verifying?: boolean;
}) {
  if (completed) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 font-mono text-[9.5px] font-black uppercase tracking-[0.08em] text-success">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Verified · completed
        </span>
        <Link
          to="/campaigns/me"
          className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-hairline px-3 font-mono text-[9.5px] font-black uppercase tracking-[0.1em] text-muted transition-colors hover:border-primary/40 hover:text-foreground"
        >
          View activity <ArrowUpRight className="h-3 w-3" aria-hidden />
        </Link>
      </div>
    );
  }

  if (!action) {
    return (
      <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
        Requirements only — no in-app action available yet
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {verifying && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/35 bg-primary/10 px-2.5 py-1 font-mono text-[9px] font-black uppercase tracking-[0.08em] text-primary">
          Verifying · final PTS depends on server verification
        </span>
      )}
      <Link
        to="/"
        search={
          action.kind === "VERIFIED_SWAP"
            ? campaignSwapActionLink(campaign, task, action)
            : campaignActionLink(campaign, task, action)
        }
        className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full bg-primary px-3.5 font-mono text-[9.5px] font-black uppercase tracking-[0.1em] text-primary-foreground transition-transform motion-safe:hover:scale-[1.02]"
      >
        <RouteIcon className="h-3 w-3" aria-hidden />
        {action.kind === "VERIFIED_SWAP"
          ? started
            ? "Continue swap"
            : "Start swap"
          : started
            ? "Continue bridge"
            : "Start bridge"}
      </Link>
    </div>
  );
}

/** Compact, rules-derived requirement summary shown next to the CTA. */
export function CampaignTaskActionSummary({
  action,
  task,
  completions,
  limit,
}: {
  action: CampaignTaskAnyAction | null;
  task: CampaignApiTask;
  completions: number;
  limit: number;
}) {
  const bits: string[] = [];
  if (action) {
    bits.push(
      action.kind === "VERIFIED_SWAP"
        ? "Verified swap"
        : action.direction === "BNB_TO_BOT"
          ? "BNB → BOT"
          : "BOT → BNB",
    );
    if (action.tokenLabel) bits.push(action.tokenLabel);
    if (action.minAmountLabel) bits.push(`min ${action.minAmountLabel}`);
  }
  if (task.requiredCount > 1) bits.push(`${task.requiredCount} actions`);
  bits.push(`${completions}/${limit} done`);
  bits.push(`${task.points.toLocaleString("en-US")} PTS`);
  return (
    <p className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
      {bits.join(" · ")}
    </p>
  );
}
