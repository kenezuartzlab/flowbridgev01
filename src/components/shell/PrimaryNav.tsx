/**
 * FlowBridge V9.1 — desktop/tablet primary navigation (>= 768px).
 *
 * Four consumer destinations in a fixed reading order (Home, Trade, Explore,
 * Activity); Profile lives with the wallet/avatar cluster on the right of the
 * shell header. Operator surfaces (Studio / My progress) are NOT equal-weight
 * consumer tabs — they live in the Explore/Profile context instead.
 */
import { Link, useRouterState } from "@tanstack/react-router";
import { PRIMARY_NAV, isNavActive } from "./navModel";

const DESKTOP_ORDER = ["home", "trade", "explore", "activity"];

export function PrimaryNav({ className = "" }: { className?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = DESKTOP_ORDER.map((id) => PRIMARY_NAV.find((d) => d.id === id)!).filter(Boolean);

  return (
    <nav
      aria-label="Primary"
      data-shell-nav="desktop"
      className={`flex flex-nowrap items-center gap-1 font-sans ${className}`}
    >
      {items.map((dest) => {
        const active = isNavActive(dest, pathname);
        const { Icon } = dest;
        return (
          <Link
            key={dest.id}
            to={dest.to}
            aria-current={active ? "page" : undefined}
            data-nav-id={dest.id}
            data-nav-active={active ? "true" : "false"}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-[var(--fb-radius-md)] border px-3 text-[12.5px] font-bold tracking-[-0.01em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
              active
                ? "border-primary/45 bg-primary/12 text-primary"
                : "border-transparent text-muted hover:border-hairline hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" strokeWidth={active ? 2.6 : 2} />
            {dest.label}
          </Link>
        );
      })}
    </nav>
  );
}
