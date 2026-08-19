/**
 * App Experience V6 — first-class destination row (Swap, Bridge, Campaigns,
 * Activity) with clear active state. Presentation only; links use existing
 * routes and never touch execution state.
 */
import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeftRight, Compass, History, Waypoints } from "lucide-react";

const ITEMS = [
  { to: "/", label: "Swap", Icon: ArrowLeftRight, hash: undefined as string | undefined },
  { to: "/", label: "Bridge", Icon: Waypoints, hash: "bridge" },
  { to: "/campaigns", label: "Campaigns", Icon: Compass, hash: undefined },
  { to: "/activity", label: "Activity", Icon: History, hash: undefined },
];

export function AppQuickNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hash = useRouterState({ select: (s) => s.location.hash });

  return (
    <nav aria-label="Primary destinations" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {ITEMS.map(({ to, label, Icon, hash: itemHash }) => {
        const active =
          to === "/"
            ? pathname === "/" && (itemHash ? hash === itemHash : hash !== "bridge")
            : pathname.startsWith(to);
        return (
          <Link
            key={label}
            to={to}
            hash={itemHash}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-[44px] items-center gap-2 rounded-[var(--fb-radius-md)] border px-3 py-2 font-mono text-[10.5px] font-black uppercase tracking-[0.1em] transition-colors ${
              active
                ? "border-primary/45 bg-primary/12 text-primary"
                : "border-hairline bg-card text-muted hover:border-primary/30 hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
