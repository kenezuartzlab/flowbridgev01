import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import giftAsset from "@/assets/gift-1.png.asset.json";
import type { BannerSlide } from "@/lib/config/appConfig";

const bridgeHero = "/__l5e/assets-v1/11289c81-991d-49ad-a2c1-b3e55906cf5c/bridge-hero.png";

type Variant = "swap" | "bridge" | "rewards" | "activity";

const COPY: Record<
  Variant,
  { title: string; body: string; art: string; href?: string }
> = {
  swap: {
    title: "Swap & Earn FLOW Points",
    body: "Earn points on every qualified swap.",
    art: giftAsset.url,
    href: "/rewards",
  },
  bridge: {
    title: "Cross-Chain Bridge",
    body: "Fast. Secure. Multi-chain.",
    art: bridgeHero,
    href: "/activity",
  },
  rewards: {
    title: "Track every FLOW point",
    body: "Rewards, tasks and claim progress.",
    art: giftAsset.url,
  },
  activity: {
    title: "Swaps & bridges, recorded",
    body: "Status, amounts and FLOW earned.",
    art: bridgeHero,
  },
};

const THEME: Record<"swap" | "bridge", { from: string; to: string; fg: string; accent: string }> = {
  swap: {
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
};

function toneOf(v: Variant): "swap" | "bridge" {
  return v === "bridge" || v === "activity" ? "bridge" : "swap";
}

/**
 * Compact presentational hero banner shown above the swap / bridge cards.
 * Accepts either a static variant or an admin-published slide. The whole
 * card is clickable when a link target exists. Never reads or writes
 * execution state.
 */
export function TabBanner({
  variant = "swap",
  slide,
  className = "",
}: {
  variant?: Variant;
  slide?: BannerSlide;
  className?: string;
}) {
  const base = COPY[variant];
  const title = slide?.title ?? base.title;
  const body = slide?.body ?? base.body;
  const art = slide?.imageUrl || base.art;
  const href = slide ? slide.href || undefined : base.href;
  const t = THEME[slide?.theme ?? toneOf(variant)];

  const inner = (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute -right-5 -top-8 h-20 w-20 rounded-full blur-2xl"
        style={{ background: `${t.accent}40` }}
      />
      <div className="relative flex w-full items-center justify-between gap-2 sm:gap-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {art && (
            <img
              src={art}
              alt=""
              aria-hidden
              loading="lazy"
              draggable={false}
              className="h-8 w-8 shrink-0 select-none object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.35)] sm:h-9 sm:w-9"
            />
          )}
          <div className="min-w-0 font-mono">
            <div
              className="truncate text-[10.5px] font-bold uppercase leading-tight tracking-wide sm:text-[11px]"
              style={{ color: t.fg }}
            >
              {title}
            </div>
            {body && (
              <div className="mt-0.5 line-clamp-1 text-[9.5px] leading-snug opacity-85 sm:text-[10px]">
                {body}
              </div>
            )}
          </div>
        </div>

        {href && (
          <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-70" style={{ color: t.accent }} />
        )}
      </div>
    </>
  );

  const cls = `relative flex min-h-[58px] w-full items-center overflow-hidden rounded-xl px-3 py-2 text-left shadow-[0_6px_18px_-14px_rgba(0,0,0,0.6)] transition-transform sm:min-h-[62px] sm:px-3.5 ${
    href ? "cursor-pointer active:scale-[0.99]" : ""
  } ${className}`;
  const style = {
    background: `linear-gradient(110deg, ${t.from}, ${t.to})`,
    color: t.fg,
    borderTop: `1px solid ${t.accent}33`,
  };

  if (href && /^https?:\/\//i.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} style={style}>
        {inner}
      </a>
    );
  }
  if (href) {
    return (
      <Link to={href} className={cls} style={style}>
        {inner}
      </Link>
    );
  }
  return (
    <section className={cls} style={style}>
      {inner}
    </section>
  );
}
