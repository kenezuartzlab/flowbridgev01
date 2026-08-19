/**
 * FlowBridge V9.1 — mobile bottom navigation (5 destinations), driven by the
 * single canonical nav model.
 *
 * V9.1 root-cause fix: the centre Trade control keeps its unique raised portal
 * shape at all times, but every *active* affordance (fill, ring, glow, label
 * colour) is now derived from `isNavActive(dest, pathname)` — previously the
 * centre item hardcoded primary colouring, so Trade looked active on Home,
 * Explore, Activity and Profile.
 */
import { Link, useRouterState } from "@tanstack/react-router";
import { PRIMARY_NAV, isNavActive } from "@/components/shell/navModel";

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const cappedSafeArea = "min(env(safe-area-inset-bottom, 0px), 10px)";

  return (
    <>
      {/* Spacer so page content is never hidden behind the fixed bar */}
      <div aria-hidden className="h-[70px] md:hidden" />
      <nav
        aria-label="Main navigation"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-hairline bg-card-alt backdrop-blur-xl md:hidden"
        style={{
          paddingBottom: cappedSafeArea,
          boxShadow: "0 -8px 24px -18px rgba(0,0,0,0.8)",
        }}
      >
        <ul className="mx-auto flex max-w-md items-stretch px-1 py-1">
          {PRIMARY_NAV.map((dest) => {
            const { Icon, primary: center } = dest;
            const active = isNavActive(dest, pathname);
            return (
              <li key={dest.id} className="min-w-0 flex-1">
                <Link
                  to={dest.to}
                  aria-current={active ? "page" : undefined}
                  data-nav-id={dest.id}
                  data-nav-active={active ? "true" : "false"}
                  className={`group relative flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                    active ? "text-primary" : "text-muted hover:text-foreground"
                  }`}
                >
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
                        ? `-mt-4 grid h-11 w-11 shrink-0 place-items-center rounded-2xl border transition-transform group-hover:scale-105 motion-reduce:transition-none ${
                            active
                              ? "border-primary/45 bg-primary/20 text-primary shadow-[0_0_0_4px_color-mix(in_srgb,var(--fb-primary)_10%,transparent),0_8px_20px_-8px_color-mix(in_srgb,var(--fb-primary)_70%,transparent)]"
                              : "border-hairline bg-card text-muted group-hover:text-foreground"
                          }`
                        : `grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors ${
                            active
                              ? "bg-primary/12 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--fb-primary)_35%,transparent)]"
                              : "bg-transparent group-hover:bg-foreground/5"
                          }`
                    }
                  >
                    <Icon
                      className={center ? "h-5 w-5" : "h-[17px] w-[17px]"}
                      strokeWidth={active ? 2.6 : 2}
                    />
                  </span>
                  <span
                    className={`w-full truncate text-center text-[9.5px] font-bold uppercase tracking-[0.05em] ${
                      active ? "text-primary" : ""
                    }`}
                  >
                    {dest.label}
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
