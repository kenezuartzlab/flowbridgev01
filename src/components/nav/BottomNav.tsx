import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeftRight, Home, LineChart, Gift, History } from "lucide-react";

/**
 * Persistent bottom bar. Redesign pass: each item is a 44px tap target with
 * the icon sitting in its own rounded plate, an active plate fill plus a top
 * indicator bar, and labels that never wrap. Purely presentational — it never
 * touches swap/bridge execution state.
 *
 * The mockup's five-tab shape (Home / Wallet / Swap / Rewards / Profile)
 * lands once the Home and Wallet routes exist; the styling here is already
 * built for five slots.
 */
const ITEMS = [
  { to: "/home", label: "Home", Icon: Home },
  { to: "/", label: "Swap", Icon: ArrowLeftRight },
  { to: "/markets", label: "Markets", Icon: LineChart },
  { to: "/rewards", label: "Rewards", Icon: Gift },
  { to: "/activity", label: "Activity", Icon: History },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const cappedSafeArea = "min(env(safe-area-inset-bottom, 0px), 10px)";

  return (
    <>
      {/* Spacer so page content is never hidden behind the fixed bar */}
      <div aria-hidden className="h-[76px] sm:h-[82px]" />
      <nav
        aria-label="Main navigation"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-hairline bg-card-alt backdrop-blur-xl"
        style={{
          paddingBottom: cappedSafeArea,
          boxShadow: "0 -8px 24px -18px rgba(0,0,0,0.8)",
        }}
      >
        <ul className="mx-auto flex max-w-lg items-stretch gap-0.5 px-1.5 py-1.5 sm:gap-1 sm:px-2">
          {ITEMS.map(({ to, label, Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <li key={to} className="min-w-0 flex-1">
                <Link
                  to={to}
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 transition-colors ${
                    active ? "text-primary" : "text-muted hover:text-foreground"
                  }`}
                >
                  {/* Active indicator rail */}
                  <span
                    aria-hidden
                    className={`absolute left-1/2 top-0 h-[2px] -translate-x-1/2 rounded-full bg-primary transition-all duration-200 ${
                      active ? "w-6 opacity-100" : "w-0 opacity-0"
                    }`}
                  />
                  <span
                    aria-hidden
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors ${
                      active
                        ? "bg-primary/12 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--fb-primary)_35%,transparent)]"
                        : "bg-transparent group-hover:bg-foreground/5"
                    }`}
                  >
                    <Icon className="h-[17px] w-[17px]" strokeWidth={active ? 2.6 : 2} />
                  </span>
                  <span className="w-full truncate text-center font-mono text-[9.5px] font-black uppercase tracking-[0.07em] sm:text-[10px]">
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
