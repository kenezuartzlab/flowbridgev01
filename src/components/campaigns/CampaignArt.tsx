/**
 * V9.1 — original FlowBridge decorative campaign art.
 * Deterministic from campaign metadata (see campaignCover). Purely decorative:
 * portal rings, network arcs, route lines and token orbs. No reward or partner
 * claims are ever rendered here.
 */
import type { CampaignApiCampaign } from "@/lib/campaign/campaignApi";
import { campaignCover } from "./campaignPresentation";

export function CampaignArt({
  campaign,
  className = "",
  children,
}: {
  campaign: CampaignApiCampaign;
  className?: string;
  children?: React.ReactNode;
}) {
  const { gradient, accent, seed } = campaignCover(campaign);
  const cx = 30 + seed * 40;

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ background: gradient }}
      aria-hidden={children ? undefined : true}
    >
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 200 120"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <defs>
          <radialGradient id={`glow-${campaign.slug}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={accent} stopOpacity="0.55" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={cx + 90} cy={20 + seed * 30} r="55" fill={`url(#glow-${campaign.slug})`} />
        {[26, 40, 54].map((r, i) => (
          <circle
            key={r}
            cx={cx}
            cy="62"
            r={r}
            fill="none"
            stroke={accent}
            strokeOpacity={0.35 - i * 0.09}
            strokeWidth="1"
          />
        ))}
        <path
          d={`M ${cx} 62 C ${cx + 40} ${20 + seed * 20}, ${cx + 90} ${90 - seed * 20}, 195 40`}
          fill="none"
          stroke={accent}
          strokeOpacity="0.55"
          strokeWidth="1.4"
          strokeDasharray="5 4"
        />
        <circle cx={cx} cy="62" r="6" fill={accent} fillOpacity="0.9" />
        <circle cx="195" cy="40" r="4.5" fill={accent} fillOpacity="0.7" />
      </svg>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0))" }}
      />
      {children ? <div className="relative">{children}</div> : null}
    </div>
  );
}
