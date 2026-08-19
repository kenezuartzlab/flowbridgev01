/**
 * FlowBridge V9 — desktop primary navigation. Icons always carry text labels,
 * active state is expressed with fill + weight (never colour alone), and focus
 * rings are preserved. Presentation only.
 */
import { Link, useRouterState } from "@tanstack/react-router";
import { OPERATOR_NAV, PRIMARY_NAV, isNavActive } from "./navModel";

export function PrimaryNav({ className = "" }: { className?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      aria-label="Primary"
      className={`hidden md:flex md:items-center md:gap-1 ${className}`}
    >
      {PRIMARY_NAV.map((dest) => {
        const active = isNavActive(dest, pathname);
        const { Icon } = dest;
        return (
          <Link
            key={dest.id}
            to={dest.to}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-[var(--fb-radius-md)] border px-3 font-mono text-[10.5px] font-black uppercase tracking-[0.1em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
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

      <span aria-hidden className="mx-1 h-5 w-px bg-hairline" />

      {OPERATOR_NAV.map((item) => (
        <Link
          key={item.id}
          to={item.to}
          className="inline-flex min-h-[40px] items-center rounded-[var(--fb-radius-md)] px-2.5 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-muted-soft transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
