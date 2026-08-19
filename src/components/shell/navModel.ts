/**
 * FlowBridge V9.1 — the single authoritative site navigation model.
 *
 * One concept, one home. Every primary destination is declared here once and
 * consumed by both PrimaryNav (desktop) and BottomNav (mobile) so the two can
 * never drift. Active state is ALWAYS derived from the canonical pathname —
 * never from component position, never from a hardcoded prop. Legacy URLs are
 * preserved: `/` is the long-standing execution workspace and is therefore an
 * alias of `/trade`, so deep links such as `/?mode=swap#bridge` keep working
 * and still light up Trade (and only Trade).
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
  /** Render as the physically centred, slightly raised mobile item. */
  primary?: boolean;
}

export const PRIMARY_NAV: NavDestination[] = [
  { id: "home", label: "Home", to: "/home", Icon: Home },
  { id: "explore", label: "Explore", to: "/campaigns", Icon: Compass },
  {
    id: "trade",
    label: "Trade",
    to: "/trade",
    Icon: ArrowLeftRight,
    aliases: ["/"],
    primary: true,
  },
  { id: "activity", label: "Activity", to: "/activity", Icon: History },
  { id: "profile", label: "Profile", to: "/account", Icon: CircleUser },
];

/** Operator surfaces are secondary navigation, never equal-weight consumer tabs. */
export const OPERATOR_NAV = [
  { id: "studio", label: "Studio", to: "/campaigns/studio" },
  { id: "participant", label: "My progress", to: "/campaigns/me" },
];

export function isNavActive(dest: NavDestination, pathname: string): boolean {
  const paths = [dest.to, ...(dest.aliases ?? [])];
  return paths.some((p) =>
    p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function activeNavId(pathname: string): string | null {
  return PRIMARY_NAV.find((d) => isNavActive(d, pathname))?.id ?? null;
}
