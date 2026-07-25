import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import giftAsset from "@/assets/gift-1.png.asset.json";

const bridgeHero = "/__l5e/assets-v1/11289c81-991d-49ad-a2c1-b3e55906cf5c/bridge-hero.png";

type Variant = "swap" | "bridge" | "rewards" | "activity";

const COPY: Record<
  Variant,
  { title: string; body: string; art: string; cta?: { label: string; to: string } }
> = {
  swap: {
    title: "Swap & Earn FLOW Points",
    body: "Earn points on every qualified swap on FlowBridge.",
    art: giftAsset.url,
    cta: { label: "View Rewards", to: "/rewards" },
  },
  bridge: {
    title: "CROSS-CHAIN BRIDGE",
    body: "Fast. Secure. Multi-chain.",
    art: bridgeHero,
  },
  rewards: {
    title: "Track every FLOW point",
    body: "Rewards overview, tasks and claim progress for your verified email + bound wallet.",
    art: giftAsset.url,
  },
  activity: {
    title: "Swaps & bridges, recorded",
    body: "Every transaction is attributed to your account with status, amounts and FLOW earned.",
    art: bridgeHero,
  },
};

const THEME: Record<Variant, { from: string; to: string; fg: string; accent: string }> = {
  swap: {
    from: "var(--fb-banner-swap-from)",
    to: "var(--fb-banner-swap-to)",
    fg: "var(--fb-banner-swap-foreground)",
    accent: "var(--fb-banner-swap-accent)",
  },
  rewards: {
    from: "var(--fb-banner-swap-from)",
    to: "var(--fb-banner-swap-to)",
    fg: "var(--fb-banner-swap-foreground)",
    accent: "var(--fb-banner-swap-accent)",
  },
  bridge: {
    from: "var(--fb-banner-bridge-from)",
    to: "var(--fb-banner-bridge-to)",
    fg: "var(--fb-banner-bridge-foreground)",
    accent: "var(--fb-banner-bridge-accent)",
  },
  activity: {
    from: "var(--fb-banner-bridge-from)",
    to: "var(--fb-banner-bridge-to)",
    fg: "var(--fb-banner-bridge-foreground)",
    accent: "var(--fb-banner-bridge-accent)",
  },
};

/**
 * Compact presentational hero banner shown above the swap / bridge cards.
 * Matches the wallet/status card footprint. Never reads or writes execution state.
 */
export function TabBanner({ variant, className = "" }: { variant: Variant; className?: string }) {
  const { title, body, art, cta } = COPY[variant];
  const t = THEME[variant];

  return (
    <section
      className={`relative flex min-h-[92px] items-center overflow-hidden rounded-2xl px-3.5 py-3 shadow-[0_8px_24px_-16px_rgba(0,0,0,0.6)] sm:px-4 ${className}`}
      style={{
        background: `linear-gradient(110deg, ${t.from}, ${t.to})`,
        color: t.fg,
        borderTop: `1px solid ${t.accent}33`,
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-10 h-28 w-28 rounded-full blur-2xl"
        style={{ background: `${t.accent}40` }}
      />
      <div className="relative flex w-full items-center justify-between gap-2.5 sm:gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <img
            src={art}
            alt=""
            aria-hidden
            loading="lazy"
            draggable={false}
            className="h-10 w-10 shrink-0 select-none object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.35)] sm:h-11 sm:w-11"
          />
          <div className="min-w-0 space-y-1 font-mono">
            <div
              className="text-[11px] font-bold uppercase leading-tight tracking-wide [overflow-wrap:anywhere]"
              style={{ color: t.fg }}
            >
              {title}
            </div>
            <div className="line-clamp-2 text-[10px] leading-snug opacity-85 [overflow-wrap:anywhere]">
              {body}
            </div>
          </div>
        </div>

        {cta ? (
          <Link
            to={cta.to}
            className="shrink-0 rounded-lg px-2.5 py-1.5 text-center font-mono text-[9px] font-bold uppercase leading-tight tracking-wider transition-all active:scale-95"
            style={{
              background: `${t.accent}26`,
              color: t.accent,
              border: `1px solid ${t.accent}40`,
            }}
          >
            {cta.label}
          </Link>
        ) : (
          <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
        )}
      </div>
    </section>
  );
}


