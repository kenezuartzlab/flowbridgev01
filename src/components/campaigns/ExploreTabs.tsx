/**
 * FlowBridge V10 — Explore sub-navigation.
 *
 * Explore is one discovery universe: Campaigns, Partners and My Progress are
 * views of the same destination, not competing top-level products. Declared once
 * here so the three routes can never drift.
 */
import { Link, useRouterState } from "@tanstack/react-router";

export const EXPLORE_VIEWS = [
  { id: "campaigns", label: "Campaigns", to: "/campaigns" },
  { id: "partners", label: "Partners", to: "/campaigns/partners" },
  { id: "progress", label: "My progress", to: "/campaigns/me" },
] as const;

export function ExploreTabs({ className = "" }: { className?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav aria-label="Explore views" className={`flex flex-wrap gap-1.5 ${className}`}>
      {EXPLORE_VIEWS.map((view) => {
        const active =
          view.to === "/campaigns" ? pathname === "/campaigns" : pathname.startsWith(view.to);
        return (
          <Link
            key={view.id}
            to={view.to}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-[36px] items-center rounded-full border px-4 text-[12.5px] font-bold transition-colors ${
              active
                ? "border-primary/45 bg-primary/12 text-primary"
                : "border-hairline text-muted hover:border-primary/40 hover:text-foreground"
            }`}
          >
            {view.label}
          </Link>
        );
      })}
    </nav>
  );
}
