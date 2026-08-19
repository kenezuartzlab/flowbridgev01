/**
 * FlowBridge V9 — the single authoritative site navigation model.
 *
 * One concept, one home. Every primary destination is declared here once and
 * consumed by both PrimaryNav (desktop) and MobileNav (bottom bar) so the two
 * can never drift. Legacy URLs are preserved: `/trade` is an alias of the
 * long-standing `/` execution workspace, and `isActive` treats them as one
 * destination so deep links such as `/?mode=swap#bridge` keep working.
 */
import { Compass, History, Home, ArrowLeftRight, CircleUser } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavDestination {
  id: string;
  label: string;
  to: string;
  Icon: LucideIcon;
  /** Extra path prefixes that belong to this destination. */
  aliases?: string[];
  /** Render as the emphasized centre item on the mobile bar. */
  primary?: boolean;
}

export const PRIMARY_NAV: NavDestination[] = [
  { id: "home", label: "Home", to: "/home", Icon: Home },
  { id: "trade", label: "Trade", to: "/trade", Icon: ArrowLeftRight, aliases: ["/"], primary: true },
  { id: "explore", label: "Explore", to: "/campaigns", Icon: Compass },
  { id: "activity", label: "Activity", to: "/activity", Icon: History },
  { id: "profile", label: "Profile", to: "/account", Icon: CircleUser },
];

/** Operator surfaces are secondary navigation, never equal-weight consumer tabs. */
export const OPERATOR_NAV = [
  { id: "studio", label: "Studio", to: "/campaigns/studio" },
  { id: "participant", label: "Participant", to: "/campaigns/me" },
];

export function isNavActive(dest: NavDestination, pathname: string): boolean {
  const paths = [dest.to, ...(dest.aliases ?? [])];
  return paths.some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`)));
}

export function activeNavId(pathname: string): string | null {
  return PRIMARY_NAV.find((d) => isNavActive(d, pathname))?.id ?? null;
}
