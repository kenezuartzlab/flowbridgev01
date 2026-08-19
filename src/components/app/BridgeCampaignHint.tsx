/**
 * App Experience V6 — non-authoritative Campaign PTS eligibility hint for the
 * bridge workspace. It only appears when a currently published campaign
 * definition actually matches the selected route chains. It never promises
 * points: settlement stays with the trusted server pipeline.
 */
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Info } from "lucide-react";
import { campaignChains } from "@/components/campaigns/campaignPresentation";
import { useCampaignProgress } from "@/lib/campaign/useCampaignProgress";

export function BridgeCampaignHint({
  sourceChainId,
  destinationChainId,
}: {
  sourceChainId?: number | null;
  destinationChainId?: number | null;
}) {
  const { campaigns } = useCampaignProgress();
  if (!sourceChainId || !destinationChainId) return null;

  const match = campaigns.find((c) => {
    const chains = campaignChains(c);
    return (
      chains.sources.includes(sourceChainId) && chains.destinations.includes(destinationChainId)
    );
  });
  if (!match) return null;

  return (
    <div className="fb-inset flex flex-wrap items-center gap-2 p-3">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
        <Info className="h-3.5 w-3.5" aria-hidden />
      </span>
      <p className="min-w-0 flex-1 font-mono text-[9.5px] uppercase leading-relaxed tracking-[0.06em] text-muted">
        This route matches “{match.name}”. Campaign PTS are only credited after the trusted
        verifier confirms the bridge on-chain — nothing is guaranteed here.
      </p>
      <Link
        to="/campaigns/$slug"
        params={{ slug: match.slug }}
        className="inline-flex min-h-[30px] shrink-0 items-center gap-1 rounded-xl border border-primary/40 px-2.5 font-mono text-[9.5px] font-black uppercase tracking-[0.08em] text-primary"
      >
        View <ArrowUpRight className="h-3 w-3" aria-hidden />
      </Link>
    </div>
  );
}
