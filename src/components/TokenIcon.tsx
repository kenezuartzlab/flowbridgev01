import React from "react";
import { cn } from "../lib/utils";
import { logoCandidates, normalizeSymbol, symbolHue } from "../lib/tokenLogos";

/** Shared size scale so every surface renders identical token circles. */
export const TOKEN_ICON_SIZES = { sm: 24, md: 32, lg: 40, xl: 56 } as const;
export type TokenIconSize = keyof typeof TOKEN_ICON_SIZES;

interface TokenIconProps {
  symbol: string;
  /** Explicit pixel size — wins over `preset`. */
  size?: number;
  /** Named size from the shared scale (default: `sm`, 24px). */
  preset?: TokenIconSize;
  className?: string;
}

/**
 * Single source of truth for token artwork.
 *
 * Renders a real token logo when one is known (local brand PNG for BOT Chain
 * assets, CDN logo for majors like BTC/ETH/USDT), otherwise a lettered circle.
 * The outer box is always a fixed square, so lists never shift while logos load.
 */
export function TokenIcon({ symbol, size, preset = "sm", className }: TokenIconProps) {
  const px = size ?? TOKEN_ICON_SIZES[preset];
  const candidates = React.useMemo(() => logoCandidates(symbol), [symbol]);
  const [idx, setIdx] = React.useState(0);

  React.useEffect(() => {
    setIdx(0);
  }, [symbol]);

  const src = candidates[idx];
  const letters = (normalizeSymbol(symbol) || "?").slice(0, 3).toUpperCase();
  const hue = symbolHue(symbol);

  const box = cn(
    "inline-grid shrink-0 place-items-center overflow-hidden rounded-full select-none",
    className,
  );
  const style = { width: px, height: px, minWidth: px, minHeight: px } as const;

  if (src) {
    return (
      <span className={cn(box, "bg-card")} style={style}>
        <img
          src={src}
          width={px}
          height={px}
          alt={`${letters} logo`}
          loading="lazy"
          draggable={false}
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain"
          onError={() => setIdx((i) => i + 1)}
        />
      </span>
    );
  }

  return (
    <span
      className={cn(box, "border font-black tabular-nums")}
      style={{
        ...style,
        fontSize: Math.max(8, Math.floor(px * (letters.length > 2 ? 0.3 : 0.4))),
        background: `oklch(0.62 0.13 ${hue} / 0.18)`,
        borderColor: `oklch(0.62 0.13 ${hue} / 0.4)`,
        color: `oklch(0.72 0.14 ${hue})`,
      }}
      aria-label={`${letters} token`}
    >
      {letters}
    </span>
  );
}
