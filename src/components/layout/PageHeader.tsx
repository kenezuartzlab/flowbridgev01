import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Archon-style page header: quiet round back button, oversized title with a
 * small subtitle underneath, and an optional trailing action slot.
 * Layout is grid-based so the title truncates instead of colliding with
 * the actions on narrow screens.
 */
export function PageHeader({
  title,
  subtitle,
  backTo = "/home",
  actions,
}: {
  title: string;
  subtitle?: string;
  backTo?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-card-alt px-3 py-3 backdrop-blur-xl sm:px-4">
      <div className="mx-auto grid max-w-2xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <Link
          to={backTo}
          aria-label="Back"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-hairline bg-card text-muted transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-[22px] font-black leading-none tracking-[-0.01em] sm:text-[26px]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 truncate font-mono text-[10px] font-black uppercase tracking-[0.14em] text-muted-soft">
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
      </div>
    </header>
  );
}
