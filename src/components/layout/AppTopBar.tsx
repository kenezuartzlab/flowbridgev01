import { Link } from "@tanstack/react-router";
import { useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PrimaryNav } from "@/components/shell/PrimaryNav";
import { ShellNavMenu } from "@/components/shell/ShellNavMenu";
import { useShellMode } from "@/components/shell/useShellMode";
import logoUrl from "@/assets/flowbridge-logo.png";

/**
 * Archon-style top bar: quiet brand mark + greeting on the left, round icon
 * buttons and the account avatar on the right. Purely presentational.
 */
export function AppTopBar({
  eyebrow = "FlowBridge",
  title,
  actions,
  avatar,
  initial = "G",
  onEyebrowClick,
}: {
  eyebrow?: string;
  title: string;
  actions?: ReactNode;
  avatar?: string | null;
  initial?: string;
  /** When provided the eyebrow becomes a button (used to cycle greetings). */
  onEyebrowClick?: () => void;
}) {
  // V9.3 — measure the actual shell row, not the browser width.
  const rowRef = useRef<HTMLDivElement | null>(null);
  const shellMode = useShellMode(rowRef);

  return (
    <header className="bg-background px-3 pb-2.5 pt-4 sm:px-4">
      <div
        ref={rowRef}
        className="mx-auto flex max-w-2xl flex-nowrap items-center gap-2.5 md:max-w-6xl"
      >
        <img
          src={logoUrl}
          alt=""
          aria-hidden
          className="h-9 w-9 shrink-0 rounded-2xl object-contain"
          loading="lazy"
        />
        <div className="min-w-0 flex-1">
          {onEyebrowClick ? (
            <Button
              variant="ghost"
              type="button"
              onClick={onEyebrowClick}
              title="Tap to change greeting"
              className="block h-auto max-w-full whitespace-normal break-words p-0 text-left font-mono text-[9.5px] font-black uppercase tracking-normal text-muted transition-colors hover:text-primary"
            >
              {eyebrow}
            </Button>
          ) : (
            <p className="break-words font-mono text-[9.5px] font-black uppercase tracking-normal text-muted">
              {eyebrow}
            </p>
          )}
          <p className="break-words text-[15px] font-black leading-tight tracking-normal sm:text-[17px]">
            {title}
          </p>
        </div>

        {shellMode === "desktop" && <PrimaryNav className="shrink-0" />}

        <div className="flex shrink-0 items-center gap-1.5">
          {actions}
          {/* The menu stays available at every width so tools such as MultiSend
              are reachable on desktop too, not only on compact layouts. */}
          <ShellNavMenu />
          <Link
            to="/account"
            aria-label="Account"
            className="grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-primary/40 bg-primary/12 font-black text-primary"
          >
            {avatar ? (
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-[13px]">{initial}</span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
