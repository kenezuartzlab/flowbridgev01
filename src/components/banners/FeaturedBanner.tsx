import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import giftAsset from "@/assets/gift-1.png.asset.json";
import type { BannerSlide, BannerSurfaceKey } from "@/lib/config/appConfig";
import { trackBannerClick } from "@/lib/banners/analytics";

/**
 * Large "featured campaign" promo card (Home surface). Purely presentational —
 * bigger than TabBanner, with artwork on the right and a pill CTA. Renders as a
 * link when the slide has a target, otherwise a static section.
 */
export function FeaturedBanner({
  slide,
  surface,
  ctaLabel = "Participate",
  className = "",
}: {
  slide: BannerSlide;
  surface?: BannerSurfaceKey;
  ctaLabel?: string;
  className?: string;
}) {
  const art = slide.imageUrl || giftAsset.url;
  const href = slide.href || undefined;
  const full = slide.layout === "full" && !!slide.imageUrl;

  const inner = (
    <>
      {full ? (
        <>
          <img
            src={art}
            alt=""
            aria-hidden
            loading="lazy"
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background/90 via-background/70 to-transparent"
          />
        </>
      ) : (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-primary/25 blur-3xl"
        />
      )}

      <div className="relative flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[9.5px] font-black uppercase tracking-[0.16em] text-primary">
            Featured campaign
          </p>
          <p className="mt-1.5 line-clamp-2 text-[15px] font-black leading-tight sm:text-base">
            {slide.title}
          </p>
          {slide.body && (
            <p className="mt-1 line-clamp-2 font-mono text-[10.5px] leading-relaxed text-muted">
              {slide.body}
            </p>
          )}
          {href && (
            <span className="mt-3 inline-flex min-h-[34px] items-center gap-1.5 rounded-full bg-primary px-3.5 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-primary-foreground">
              {ctaLabel}
              <ArrowRight className="h-3 w-3" />
            </span>
          )}
        </div>

        {!full && (
          <img
            src={art}
            alt=""
            aria-hidden
            loading="lazy"
            draggable={false}
            className="h-20 w-20 shrink-0 select-none object-contain drop-shadow-[0_10px_22px_rgba(0,0,0,0.35)] sm:h-24 sm:w-24"
          />
        )}
      </div>
    </>
  );

  const cls = `fb-surface relative block w-full overflow-hidden p-4 text-left ${
    href ? "transition-transform active:scale-[0.995]" : ""
  } ${className}`;
  const label = slide.body ? `${slide.title} — ${slide.body}` : slide.title;
  const onActivate = () => {
    if (surface) trackBannerClick(surface, slide.id);
  };

  if (href && /^https?:\/\//i.test(href)) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        onClick={onActivate}
        className={cls}
      >
        {inner}
      </a>
    );
  }
  if (href) {
    return (
      <Link to={href} aria-label={label} onClick={onActivate} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <section aria-label={label} className={cls}>
      {inner}
    </section>
  );
}
