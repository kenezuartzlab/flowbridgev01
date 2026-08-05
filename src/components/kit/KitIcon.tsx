import { KIT, type KitName } from "@/lib/kit";

/**
 * Renders one asset-kit illustration at a fixed square size.
 * Decorative by default (empty alt) — pass `label` when the icon carries
 * meaning that isn't already in adjacent text.
 */
export function KitIcon({
  name,
  size = 40,
  label,
  className = "",
  glow = false,
}: {
  name: KitName;
  size?: number;
  label?: string;
  className?: string;
  glow?: boolean;
}) {
  return (
    <img
      src={KIT[name]}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      width={size}
      height={size}
      loading="lazy"
      draggable={false}
      style={{ width: size, height: size }}
      className={`shrink-0 select-none object-contain ${
        glow ? "drop-shadow-[0_0_14px_color-mix(in_srgb,var(--fb-primary)_35%,transparent)]" : ""
      } ${className}`}
    />
  );
}
