/**
 * App Experience V6 — compact Campaign PTS chip for the app shell header.
 * Read-only: it renders the server-provided total from /api/campaigns and
 * shows nothing for guests. Never used to award or promise points.
 */
import { Link } from "@tanstack/react-router";
import { Trophy } from "lucide-react";
import { useCampaignProgress } from "@/lib/campaign/useCampaignProgress";

export function CampaignPtsPill() {
  const { authenticated, campaignPointsTotal, loading } = useCampaignProgress();
  if (!authenticated) return null;

  return (
    <Link
      to="/campaigns/me"
      aria-label={`${campaignPointsTotal.toLocaleString("en-US")} Campaign PTS`}
      title="Campaign PTS — verified campaign score, not FLOW"
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-2xl border border-accent/35 bg-accent/10 px-2.5 font-mono text-[10px] font-black tabular-nums text-accent transition-colors hover:bg-accent/20"
    >
      <Trophy className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {loading ? "—" : campaignPointsTotal.toLocaleString("en-US")}
      {/* Never a bare trophy number: the unit is always visible. */}
      <span className="hidden sm:inline">Campaign PTS</span>
      <span className="sm:hidden">C-PTS</span>
    </Link>
  );
}
