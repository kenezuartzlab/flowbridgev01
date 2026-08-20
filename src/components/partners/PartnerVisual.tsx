/**
 * FlowBridge V10 — the single partner visual primitive.
 *
 * Consistent with CampaignVisual (deterministic preset art, decorative only,
 * image degrades to art) but visually distinct: partner motifs are portal rings,
 * route beams, network nodes and prism facets rather than campaign geometry.
 */
import type { ReactNode } from "react";
import { useState } from "react";
import type { PartnerCard } from "@/lib/config/appConfig";
import { partnerVisual, type PartnerArtPreset } from "./partnerPresentation";

export type PartnerVisualVariant = "banner" | "tile" | "mark";

const VARIANT_BOX: Record<PartnerVisualVariant, string> = {
  banner: "h-28 sm:h-32",
  tile: "h-20",
  mark: "h-12 w-12 rounded-xl",
};

function PresetArt({
  preset,
  accent,
  seed,
  id,
}: {
  preset: PartnerArtPreset;
  accent: string;
  seed: number;
  id: string;
}) {
  const cx = 40 + seed * 120;

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 200 120"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <radialGradient id={`fbpglow-${id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={accent} stopOpacity="0.5" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={30 + seed * 40} r="60" fill={`url(#fbpglow-${id})`} />

      {preset === "rings" &&
        [18, 32, 46, 60].map((r, i) => (
          <ellipse
            key={r}
            cx={cx}
            cy="66"
            rx={r}
            ry={r * 0.55}
            fill="none"
            stroke={accent}
            strokeOpacity={0.4 - i * 0.08}
            strokeWidth="1"
          />
        ))}

      {preset === "beams" &&
        [0, 1, 2, 3, 4].map((i) => (
          <line
            key={i}
            x1="-10"
            y1={16 + i * 22 + seed * 10}
            x2="210"
            y2={4 + i * 26 - seed * 12}
            stroke={accent}
            strokeOpacity={0.4 - i * 0.06}
            strokeWidth="1.1"
            strokeDasharray={i % 2 ? "8 6" : undefined}
          />
        ))}

      {preset === "nodes" && (
        <g>
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const x = 20 + ((i * 41 + seed * 70) % 165);
            const y = 24 + ((i * 33 + seed * 50) % 74);
            return (
              <g key={i}>
                <line
                  x1={x}
                  y1={y}
                  x2={100 + seed * 20}
                  y2="62"
                  stroke={accent}
                  strokeOpacity="0.22"
                  strokeWidth="0.8"
                />
                <circle cx={x} cy={y} r={3 + (i % 3)} fill={accent} fillOpacity="0.5" />
              </g>
            );
          })}
          <circle cx={100 + seed * 20} cy="62" r="6" fill={accent} fillOpacity="0.85" />
        </g>
      )}

      {preset === "prism" &&
        [0, 1, 2].map((i) => (
          <polygon
            key={i}
            points={`${30 + i * 56},92 ${58 + i * 56},${34 + seed * 18} ${86 + i * 56},92`}
            fill="none"
            stroke={accent}
            strokeOpacity={0.45 - i * 0.1}
            strokeWidth="1.2"
          />
        ))}
    </svg>
  );
}

export function PartnerVisual({
  partner,
  variant = "tile",
  className = "",
  children,
}: {
  partner: PartnerCard;
  variant?: PartnerVisualVariant;
  className?: string;
  children?: ReactNode;
}) {
  const visual = partnerVisual(partner);
  const [imageFailed, setImageFailed] = useState(false);
  const useImage = !!visual.imageUrl && !imageFailed;
  const id = `${partner.id}-${variant}`;

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
        />
      ) : (
        <PresetArt
          preset={visual.artPreset}
          accent={visual.accentColor}
          seed={visual.seed}
          id={id}
        />
      )}
      {children ? <div className="relative">{children}</div> : null}
    </div>
  );
}
