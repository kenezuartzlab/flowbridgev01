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

/**
 * Presentational hero banner shown above the swap / bridge cards.
 * Never reads or writes execution state.
 */
export function TabBanner({ variant, className = "" }: { variant: Variant; className?: string }) {
  const { title, body, art, cta } = COPY[variant];

  return (
    <section
      className={`relative overflow-hidden rounded-2xl bg-[linear-gradient(110deg,var(--fb-banner-from),var(--fb-banner-to))] px-4 py-4 shadow-[0_10px_30px_-14px_rgba(0,0,0,0.6)] sm:px-5 ${className}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-12 h-40 w-40 rounded-full bg-white/15 blur-3xl"
      />
      <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:gap-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-black leading-tight tracking-tight text-[var(--fb-banner-foreground)] sm:text-[18px]">
            {title}
          </h2>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--fb-banner-foreground)]/80 sm:text-[12.5px]">
            {body}
          </p>
          {cta ? (
            <Link
              to={cta.to}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--fb-banner-foreground)]/12 px-3 py-1.5 text-[11px] font-bold text-[var(--fb-banner-foreground)] ring-1 ring-inset ring-[var(--fb-banner-foreground)]/30 transition-colors hover:bg-[var(--fb-banner-foreground)]/20"
            >
              {cta.label}
              <ArrowRight className="h-3 w-3" />
            </Link>
          ) : null}
        </div>
        <img
          src={art}
          alt=""
          aria-hidden
          loading="lazy"
          width={1024}
          height={700}
          draggable={false}
          className="h-20 w-24 shrink-0 select-none object-contain drop-shadow-[0_8px_20px_rgba(0,0,0,0.35)] sm:h-24 sm:w-32 animate-fade-in"
        />
      </div>
    </section>
  );
}
