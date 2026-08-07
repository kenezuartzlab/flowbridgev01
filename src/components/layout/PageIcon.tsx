/**
 * Renders an admin-configurable page icon slot (control panel → Pages & Heroes
 * → Icons). Falls back to the built-in artwork when nothing is overridden and
 * renders nothing when the admin picked "None".
 */
import { ActionIcon } from "@/components/ActionIcon";
import { pageIcon, useAppConfig, type PageKey } from "@/lib/config/appConfig";

export function PageIcon({
  page,
  slot,
  size = 26,
  className = "",
}: {
  page: PageKey;
  slot: string;
  size?: number;
  className?: string;
}) {
  const config = useAppConfig();
  const icon = pageIcon(config, page, slot);
  if (icon.kind === "none") return null;

  return (
    <span
      className={`inline-grid shrink-0 place-items-center ${className}`}
      style={{ width: size, height: size }}
    >
      <ActionIcon
        kind={icon.kind === "lucide" ? "lucide" : icon.kind === "image" ? "image" : "kit"}
        name={icon.name}
        imageUrl={icon.imageUrl}
        className="h-full w-full"
      />
    </span>
  );
}
