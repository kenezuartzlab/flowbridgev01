import swapHero from "@/assets/swap-hero.png";

const bridgeHero = "/__l5e/assets-v1/11289c81-991d-49ad-a2c1-b3e55906cf5c/bridge-hero.png";

type Variant = "swap" | "bridge" | "rewards" | "activity";

const COPY: Record<Variant, { eyebrow: string; title: string; body: string; art: string }> = {
  swap: {
    eyebrow: "Earn FLOW",
    title: "Swap & earn rewards",
    body: "Every swap on BOT Chain accrues FLOW points to your verified email + bound wallet.",
    art: swapHero,
  },
  bridge: {
    eyebrow: "Cross-chain",
    title: "Bridge USDT in minutes",
    body: "BOT ↔ BNB, ETH and TRON with live confirmation tracking. Recorded in your activity.",
    art: bridgeHero,
  },
  rewards: {
    eyebrow: "FLOW Rewards",
    title: "Track every FLOW point",
    body: "Rewards overview, tasks and claim progress for your verified email + bound wallet.",
    art: swapHero,
  },
  activity: {
    eyebrow: "Your history",
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
  const { eyebrow, title, body, art } = COPY[variant];

  return (
    <section
      className={`relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card-alt to-card px-4 py-4 sm:px-5 sm:py-5 ${className}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/20 blur-3xl"
      />
      <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[9px] font-black uppercase tracking-[0.16em] text-primary sm:text-[10px]">
            {eyebrow}
          </p>
          <h2 className="mt-1.5 text-[16px] font-black leading-tight tracking-tight text-foreground sm:text-[19px]">
            {title}
          </h2>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted sm:text-[12.5px]">{body}</p>
        </div>
        <img
          src={art}
          alt=""
          aria-hidden
          loading="lazy"
          width={1024}
          height={700}
          draggable={false}
          className="h-16 w-20 shrink-0 select-none object-contain drop-shadow-[0_6px_18px_rgba(50,255,139,0.25)] sm:h-24 sm:w-32 animate-fade-in"
        />
      </div>
    </section>
  );
}

