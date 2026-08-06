/**
 * Renders an admin-configurable icon for quick actions and menu rows.
 *
 * Three sources are supported:
 *  - `lucide` — a name from ACTION_ICONS (the built-in line-icon library)
 *  - `kit`    — a name from the 3D asset kit (see @/lib/kit)
 *  - `image`  — an uploaded/pasted image URL
 */
import {
  ArrowLeftRight,
  ArrowUpRight,
  BadgeCheck,
  Bell,
  BookOpen,
  Bot,
  Coins,
  Compass,
  CreditCard,
  Crown,
  Gamepad2,
  Gift,
  Globe,
  Heart,
  History,
  Info,
  LifeBuoy,
  LineChart,
  Link2,
  Lock,
  Mail,
  Medal,
  Rocket,
  Send,
  Settings,
  Shield,
  Sparkles,
  Star,
  Target,
  Ticket,
  Trophy,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { KIT, type KitName } from "@/lib/kit";

export const ACTION_ICONS = {
  ArrowLeftRight,
  ArrowUpRight,
  BadgeCheck,
  Bell,
  BookOpen,
  Bot,
  Coins,
  Compass,
  CreditCard,
  Crown,
  Gamepad2,
  Gift,
  Globe,
  Heart,
  History,
  Info,
  LifeBuoy,
  LineChart,
  Link2,
  Lock,
  Mail,
  Medal,
  Rocket,
  Send,
  Settings,
  Shield,
  Sparkles,
  Star,
  Target,
  Ticket,
  Trophy,
  Users,
  Wallet,
  Zap,
} as const;

export type ActionIconName = keyof typeof ACTION_ICONS;

export const ACTION_ICON_NAMES = Object.keys(ACTION_ICONS) as ActionIconName[];
export const KIT_ICON_NAMES = Object.keys(KIT) as KitName[];

export type IconKind = "lucide" | "kit" | "image";

/** How artwork fills its slot: "contain" = padded, "cover" = full-bleed. */
export type IconFit = "contain" | "cover";

export function ActionIcon({
  kind = "lucide",
  name,
  imageUrl,
  className = "h-4 w-4",
  label,
  fit = "contain",
}: {
  kind?: IconKind;
  name?: string;
  imageUrl?: string | null;
  className?: string;
  label?: string;
  fit?: IconFit;
}) {
  const objectCls = fit === "cover" ? "object-cover" : "object-contain";

  if (kind === "image" && imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={label ?? ""}
        aria-hidden={label ? undefined : true}
        loading="lazy"
        draggable={false}
        className={`${className} select-none ${objectCls}`}
      />
    );
  }

  if (kind === "kit") {
    const src = KIT[(name as KitName) ?? "flowbridge"] ?? KIT.flowbridge;
    return (
      <img
        src={src}
        alt={label ?? ""}
        aria-hidden={label ? undefined : true}
        loading="lazy"
        draggable={false}
        className={`${className} select-none ${objectCls}`}
      />
    );
  }

  const Icon = ACTION_ICONS[(name as ActionIconName) ?? "Sparkles"] ?? Sparkles;
  return <Icon className={className} aria-hidden />;
}

