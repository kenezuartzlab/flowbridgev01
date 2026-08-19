/**
 * V8 — campaign task context banner for the swap workspace.
 * Pure presentation: it reflects validated URL context + published campaign
 * rules. It never decides verification, settlement or PTS.
 */
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Info, ShieldCheck } from "lucide-react";
import { chainName } from "@/components/campaigns/campaignPresentation";
import {
  resolveCampaignTaskSwapAction,
  type CampaignSwapActionSearch,
} from "@/lib/campaign/campaignAction";
import { useCampaignProgress } from "@/lib/campaign/useCampaignProgress";

export function SwapCampaignTaskBanner({
  ctx,
  currentChainId,
}: {
  ctx: CampaignSwapActionSearch;
  currentChainId?: number | null;
}) {
  const { campaigns } = useCampaignProgress();
  const campaign = campaigns.find((c) => c.slug === ctx.campaign);
  const task = campaign?.tasks.find((t) => t.taskId === ctx.task);
  if (!campaign || !task) return null;
  const action = resolveCampaignTaskSwapAction(task);
  if (!action || action.chainId !== ctx.chain) return null;

  const matching = currentChainId == null || currentChainId === action.chainId;

  return (
    <div className={`fb-inset mt-4 space-y-2 p-3 ${matching ? "border-primary/35" : "border-warning/40"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
          {matching ? (
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Info className="h-3.5 w-3.5" aria-hidden />
          )}
        </span>
        <p className="min-w-0 flex-1 font-mono text-[10px] font-black uppercase tracking-[0.08em]">
          {campaign.name} · {task.title}
        </p>
        <span className="shrink-0 rounded-xl bg-primary/12 px-2.5 py-1 font-mono text-[9.5px] font-black tabular-nums text-primary">
          {task.points.toLocaleString("en-US")} PTS
        </span>
      </div>

      <p className="font-mono text-[9.5px] uppercase leading-relaxed tracking-[0.06em] text-muted">
        {matching ? (
          <>
            Verified swap task on {chainName(action.chainId)} · {action.tokenLabel} in
            {action.minAmountLabel ? ` · minimum ${action.minAmountLabel}` : ""}. Campaign PTS are
            credited only after the trusted verifier confirms your swap on-chain.
          </>
        ) : (
          <>
            Not matching task requirements — this task needs a swap on{" "}
            {chainName(action.chainId)}. Nothing here claims eligibility.
          </>
        )}
      </p>

      <Link
        to="/campaigns/$slug"
        params={{ slug: campaign.slug }}
        className="inline-flex min-h-[30px] items-center gap-1 rounded-xl border border-primary/40 px-2.5 font-mono text-[9.5px] font-black uppercase tracking-[0.08em] text-primary"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden />
        Back to campaign
      </Link>
    </div>
  );
}
