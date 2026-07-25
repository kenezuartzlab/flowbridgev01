import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeftRight, LineChart, Gift, History } from "lucide-react";

/**
 * P1 navigation — persistent bottom bar that lifts the growth surfaces
 * (Rewards / Activity) out of modals and into real routes. Purely
 * presentational: it never touches swap/bridge execution state.
 */
const ITEMS = [
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
      <div aria-hidden className="h-[72px] sm:h-[78px]" />
      <nav
        aria-label="Main navigation"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-hairline bg-card-alt backdrop-blur-xl"
        style={{ paddingBottom: cappedSafeArea }}
      >
        <ul className="mx-auto flex max-w-lg items-stretch justify-between px-2 py-1.5">
          {ITEMS.map(({ to, label, Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <li key={to} className="flex-1">
                <Link
                  to={to}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl py-2 transition-colors ${
                    active
                      ? "text-primary bg-primary/10"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.5 : 2} />
                  <span className="font-mono text-[10px] font-black uppercase tracking-[0.08em]">
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
