/**
 * FlowBridge V9.3 — the compact navigation surface.
 *
 * At mobile/compact widths the inline desktop navigation is not rendered; this
 * hamburger drawer becomes the only top navigation surface. Active state is
 * always derived from the canonical pathname via the shared nav model, and the
 * trigger itself is never treated as a destination.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { PRIMARY_NAV, isNavActive } from "./navModel";

export function ShellNavMenu({ className = "" }: { className?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`relative font-sans ${className}`} ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open navigation"
        data-shell-nav="compact-trigger"
        className={`grid h-9 w-9 place-items-center rounded-2xl border transition-colors ${
          open
            ? "border-primary/50 bg-primary/15 text-primary"
            : "border-hairline bg-card text-muted hover:border-primary/40 hover:text-foreground"
        }`}
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {open && (
        <div
          role="menu"
          data-shell-nav="compact-drawer"
          className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-2xl border border-hairline bg-card/95 backdrop-blur-xl shadow-[0_20px_50px_-10px_rgba(0,0,0,0.7)]"
        >
          <ul className="py-1">
            {PRIMARY_NAV.map((dest) => {
              const active = isNavActive(dest, pathname);
              const { Icon } = dest;
              return (
                <li key={dest.id}>
                  <Link
                    to={dest.to}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    data-nav-id={dest.id}
                    data-nav-active={active ? "true" : "false"}
                    className={`flex items-center gap-3 px-3 py-2.5 text-[13px] font-bold transition-colors ${
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-foreground/5 hover:text-primary"
                    }`}
                  >
                    <Icon className="h-4 w-4" strokeWidth={active ? 2.6 : 2} />
                    <span className="truncate">{dest.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
