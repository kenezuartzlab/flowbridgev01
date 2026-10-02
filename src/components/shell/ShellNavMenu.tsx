/**
 * FlowBridge V9.3 — the compact navigation surface.
 *
 * At mobile/compact widths the inline desktop navigation is not rendered; this
 * hamburger drawer becomes the only top navigation surface. Active state is
 * always derived from the canonical pathname via the shared nav model, and the
 * trigger itself is never treated as a destination.
 */
import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { LogIn, LogOut, Menu, X } from "lucide-react";
import { MENU_NAV, isNavActive } from "./navModel";
import { supabase } from "@/integrations/supabase/client";
import { googleSignIn, logout } from "@/lib/auth";
import { ModalPortal } from "@/modals/ModalPortal";

export function ShellNavMenu({ className = "" }: { className?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (alive) setSignedIn(!!data.session?.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session?.user);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSignIn = async () => {
    if (authBusy) return;
    setAuthBusy(true);
    try {
      await googleSignIn(window.location.href);
      setOpen(false);
    } catch {
      /* user cancelled or provider error — menu stays as-is */
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    if (authBusy) return;
    setAuthBusy(true);
    try {
      await logout();
      setOpen(false);
    } finally {
      setAuthBusy(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`relative font-sans ${className}`}>
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
        <ModalPortal>
        <div className="fixed inset-0 z-[200] bg-background/72 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
        <div role="menu" data-shell-nav="compact-drawer" className="absolute bottom-0 right-0 top-0 flex w-[min(92vw,390px)] flex-col overflow-hidden border-l border-hairline bg-card shadow-2xl sm:bottom-auto sm:top-3 sm:right-3 sm:max-h-[calc(100dvh-1.5rem)] sm:rounded-3xl sm:border">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-hairline px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="min-w-0"><p className="truncate text-base font-black text-foreground">Menu</p><p className="truncate text-[11px] font-semibold text-muted">Navigate FlowBridge</p></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close navigation" className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-hairline bg-background text-muted hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <ul className="flex-1 overflow-y-auto p-2">
            {MENU_NAV.map((dest) => {
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
                    className={`flex min-h-[52px] items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-bold transition-colors ${
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
          <div className="border-t border-hairline p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {signedIn ? (
              <button
                type="button"
                role="menuitem"
                onClick={handleSignOut}
                disabled={authBusy}
                className="flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-bold text-foreground transition-colors hover:bg-foreground/5 hover:text-primary disabled:opacity-50"
              >
                <LogOut className="h-4 w-4" />
                <span className="truncate">Sign out</span>
              </button>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={handleSignIn}
                disabled={authBusy}
                className="flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-bold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
              >
                <LogIn className="h-4 w-4" />
                <span className="truncate">{authBusy ? "Signing in…" : "Sign in"}</span>
              </button>
            )}
          </div>
        </div>
        </div>
        </ModalPortal>
      )}
    </div>
  );
}
