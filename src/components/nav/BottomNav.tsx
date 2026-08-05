import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeftRight, Home, Wallet, Gift, CircleUser } from "lucide-react";

/**
 * Persistent bottom bar. Redesign pass: each item is a 44px tap target with
 * the icon sitting in its own rounded plate, an active plate fill plus a top
 * indicator bar, and labels that never wrap. Purely presentational — it never
 * touches swap/bridge execution state.
 */
const ITEMS = [
  { to: "/home", label: "Home", Icon: Home },
  { to: "/wallet", label: "Wallet", Icon: Wallet },
  { to: "/", label: "Swap", Icon: ArrowLeftRight },
  { to: "/rewards", label: "Rewards", Icon: Gift },
  { to: "/account", label: "Account", Icon: CircleUser },
] as const;



export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const cappedSafeArea = "min(env(safe-area-inset-bottom, 0px), 10px)";

  return (
    <>
      {/* Spacer so page content is never hidden behind the fixed bar */}
      <div aria-hidden className="h-[66px] sm:h-[70px]" />
      <nav
        aria-label="Main navigation"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-hairline bg-card-alt backdrop-blur-xl"
        style={{
          paddingBottom: cappedSafeArea,
          boxShadow: "0 -8px 24px -18px rgba(0,0,0,0.8)",
        }}
      >
        <ul className="mx-auto flex max-w-md items-stretch gap-0 px-1 py-1">
          {ITEMS.map(({ to, label, Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            const center = to === "/";
            return (
              <li key={to} className="min-w-0 flex-1">
                <Link
                  to={to}
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-1 transition-colors ${
                    active ? "text-primary" : "text-muted hover:text-foreground"
                  }`}
                >
                  {/* Active indicator rail */}
                  {!center && (
                    <span
                      aria-hidden
                      className={`absolute left-1/2 top-0 h-[2px] -translate-x-1/2 rounded-full bg-primary transition-all duration-200 ${
                        active ? "w-5 opacity-100" : "w-0 opacity-0"
                      }`}
                    />
                  )}
                  <span
                    aria-hidden
                    className={
                      center
                        ? "-mt-4 grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-primary/45 bg-primary/20 text-primary shadow-[0_0_0_4px_color-mix(in_srgb,var(--fb-primary)_10%,transparent),0_8px_20px_-8px_color-mix(in_srgb,var(--fb-primary)_70%,transparent)] transition-transform group-hover:scale-105"
                        : `grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors ${
                            active
                              ? "bg-primary/12 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--fb-primary)_35%,transparent)]"
                              : "bg-transparent group-hover:bg-foreground/5"
                          }`
                    }
                  >
                    <Icon
                      className={center ? "h-5 w-5" : "h-[17px] w-[17px]"}
                      strokeWidth={active || center ? 2.6 : 2}
                    />
                  </span>
                  <span
                    className={`w-full truncate text-center font-mono text-[9px] font-black uppercase tracking-[0.05em] sm:text-[9.5px] ${
                      center ? "text-primary" : ""
                    }`}
                  >
                    {label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

      </nav>
    </>
  );
}
