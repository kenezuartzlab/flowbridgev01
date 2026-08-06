import type { ReactNode } from "react";
import { KitIcon } from "@/components/kit/KitIcon";
import type { KitName } from "@/lib/kit";
import { heroStyle, type PageHeroSettings } from "@/lib/config/appConfig";

/**
 * Admin-themeable hero/dashboard card.
 *
 * Keeps the built-in gradient for `variant` unless the control panel published
 * custom colors, and layers an optional background image plus a corner
 * illustration (3D kit asset or uploaded logo).
 */
export function HeroCard({
  hero,
  variant,
  className = "",
  children,
}: {
  hero: PageHeroSettings;
  variant: "home" | "wallet" | "rewards" | "account";
  className?: string;
  children: ReactNode;
}) {
  const style = heroStyle(hero);
  const kind = hero.artworkKind ?? "none";
  const size = hero.artworkSize ?? 128;
  const opacity = (hero.artworkOpacity ?? 20) / 100;

  return (
    <section
      className={`fb-hero fb-hero-${variant} ${className}`}
      style={style}
    >
      {hero.backgroundImageUrl && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${hero.backgroundImageUrl})`,
            opacity: (hero.backgroundOpacity ?? 35) / 100,
          }}
        />
      )}

      {kind === "kit" && hero.artworkName && (
        <KitIcon
          name={hero.artworkName as KitName}
          size={size}
          className="pointer-events-none absolute -right-6 -top-7"
          // opacity is admin-tunable, so it stays inline
          {...{ style: { width: size, height: size, opacity } }}
        />
      )}
      {kind === "image" && hero.artworkUrl && (
        <img
          src={hero.artworkUrl}
          alt=""
          aria-hidden
          loading="lazy"
          className="pointer-events-none absolute -right-6 -top-7 object-contain"
          style={{ width: size, height: size, opacity }}
        />
      )}

      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-white/10 blur-2xl"
      />

      {children}
    </section>
  );
}
