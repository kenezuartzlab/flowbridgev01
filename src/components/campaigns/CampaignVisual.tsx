/**
 * V9.2 — the single campaign visual primitive.
 *
 * Every campaign surface (Explore spotlight, standard card, Home featured,
 * Campaign Detail hero and the Trade campaign-context strip) renders artwork
 * through this component so one campaign has exactly one presentation
 * definition with responsive crops instead of per-page hardcoded art.
 *
 * Artwork is decorative only. It never implies a reward asset, partner, token
 * amount, eligibility or status that is not present in authoritative campaign
 * data. A remote image always degrades to the deterministic preset gradient, so
 * a missing image can never produce a broken campaign card.
 */
import type { ReactNode } from "react";
import { useState } from "react";
import type { CampaignApiCampaign } from "@/lib/campaign/campaignApi";
import {
  campaignVisual,
  type CampaignArtPreset,
  type CampaignVisualConfig,
} from "./campaignPresentation";

export type CampaignVisualVariant = "spotlight" | "card" | "hero" | "strip";

const VARIANT_BOX: Record<CampaignVisualVariant, string> = {
  spotlight: "h-40 lg:h-full",
  card: "h-24 sm:h-28",
  hero: "absolute inset-0",
  strip: "h-14",
};

/** Decorative SVG geometry per preset — original FlowBridge motifs. */
function PresetArt({
  preset,
  accent,
  seed,
  id,
}: {
  preset: CampaignArtPreset;
  accent: string;
  seed: number;
  id: string;
}) {
  const cx = 30 + seed * 40;

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 200 120"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <radialGradient id={`fbglow-${id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={accent} stopOpacity="0.55" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={cx + 90} cy={20 + seed * 30} r="55" fill={`url(#fbglow-${id})`} />

      {preset === "portal" && (
        <>
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
          <circle cx={cx} cy="62" r="6" fill={accent} fillOpacity="0.9" />
        </>
      )}

      {preset === "arcs" &&
        [0, 1, 2, 3].map((i) => (
          <path
            key={i}
            d={`M -10 ${100 - i * 18} C 50 ${40 - i * 10 + seed * 20}, 140 ${
              120 - i * 14
            }, 210 ${30 + i * 12}`}
            fill="none"
            stroke={accent}
            strokeOpacity={0.42 - i * 0.08}
            strokeWidth="1.2"
          />
        ))}

      {preset === "orbs" &&
        [0, 1, 2, 3, 4, 5].map((i) => (
          <circle
            key={i}
            cx={18 + ((i * 37 + seed * 60) % 170)}
            cy={22 + ((i * 29 + seed * 40) % 80)}
            r={4 + ((i + seed * 5) % 4) * 2}
            fill={accent}
            fillOpacity={0.18 + (i % 3) * 0.14}
          />
        ))}

      {preset === "route" && (
        <>
          <path
            d={`M 10 ${90 - seed * 20} L 70 ${40 + seed * 20} L 130 ${88 - seed * 20} L 192 ${
              34 + seed * 18
            }`}
            fill="none"
            stroke={accent}
            strokeOpacity="0.6"
            strokeWidth="1.4"
            strokeDasharray="6 5"
          />
          {[10, 70, 130, 192].map((x, i) => (
            <circle
              key={x}
              cx={x}
              cy={i % 2 === 0 ? 90 - seed * 20 - (i === 2 ? 2 : 0) : 40 + seed * 20}
              r="4"
              fill={accent}
              fillOpacity="0.85"
            />
          ))}
        </>
      )}

      {preset === "grid" && (
        <g stroke={accent} strokeOpacity="0.22" strokeWidth="0.8">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <line key={`v${i}`} x1={i * 28 + seed * 10} y1="0" x2={i * 28 + seed * 10} y2="120" />
          ))}
          {[0, 1, 2, 3, 4].map((i) => (
            <line key={`h${i}`} x1="0" y1={i * 28} x2="200" y2={i * 28} />
          ))}
        </g>
      )}

      {preset === "chain" && (
        <>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect
                x={22 + i * 62}
                y={44 + ((i + seed * 3) % 2) * 14}
                width="30"
                height="30"
                rx="9"
                fill="none"
                stroke={accent}
                strokeOpacity="0.5"
                strokeWidth="1.2"
              />
              {i < 2 && (
                <line
                  x1={52 + i * 62}
                  y1={59 + ((i + seed * 3) % 2) * 14}
                  x2={84 + i * 62}
                  y2={59 + ((i + 1 + seed * 3) % 2) * 14}
                  stroke={accent}
                  strokeOpacity="0.4"
                  strokeWidth="1.2"
                  strokeDasharray="4 3"
                />
              )}
            </g>
          ))}
        </>
      )}
    </svg>
  );
}

export function CampaignVisual({
  campaign,
  variant = "card",
  overrides,
  className = "",
  children,
}: {
  campaign: CampaignApiCampaign;
  variant?: CampaignVisualVariant;
  /** Admin presentation overrides (presentation only — never reward data). */
  overrides?: Partial<CampaignVisualConfig>;
  className?: string;
  children?: ReactNode;
}) {
  const visual = { ...campaignVisual(campaign), ...overrides };
  const [imageFailed, setImageFailed] = useState(false);
  const useImage = visual.artMode === "image" && !!visual.imageUrl && !imageFailed;
  const id = `${campaign.slug || campaign.campaignId}-${variant}`;

  return (
    <div
      className={`relative overflow-hidden ${VARIANT_BOX[variant]} ${className}`}
      style={{ background: visual.gradient }}
      aria-hidden={children ? undefined : true}
    >
      {useImage ? (
        <img
          src={visual.imageUrl!}
          alt=""
          aria-hidden
          loading="lazy"
          draggable={false}
          onError={() => setImageFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: visual.focalPosition }}
        />
      ) : (
        <PresetArt preset={visual.artPreset} accent={visual.accentColor} seed={visual.seed} id={id} />
      )}

      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(to top, rgba(0,0,0,${visual.overlay}), rgba(0,0,0,0))`,
        }}
      />

      {children ? <div className="relative">{children}</div> : null}
    </div>
  );
}
