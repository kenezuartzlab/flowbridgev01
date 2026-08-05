import { Link } from "@tanstack/react-router";
import { Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { useTheme } from "@/lib/theme";
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
  const [theme, setTheme] = useTheme();

  return (
    <header className="bg-background px-3 pb-2.5 pt-4 sm:px-4">
      <div className="mx-auto flex max-w-2xl items-center gap-2.5">
        <img
          src={logoUrl}
          alt=""
          aria-hidden
          className="h-9 w-9 shrink-0 rounded-2xl object-contain"
          loading="lazy"
        />
        <div className="min-w-0 flex-1">
          {onEyebrowClick ? (
            <button
              type="button"
              onClick={onEyebrowClick}
              title="Tap to change greeting"
              className="block max-w-full truncate font-mono text-[9.5px] font-black uppercase tracking-[0.16em] text-muted transition-colors hover:text-primary"
            >
              {eyebrow}
            </button>
          ) : (
            <p className="truncate font-mono text-[9.5px] font-black uppercase tracking-[0.16em] text-muted">
              {eyebrow}
            </p>
          )}
          <p className="truncate text-[15px] font-black leading-tight tracking-[-0.01em] sm:text-[17px]">
            {title}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {actions}
          <button
            type="button"
            onClick={() => setTheme()}
            aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            className="grid h-9 w-9 place-items-center rounded-2xl border border-hairline bg-card text-muted transition-colors hover:border-primary/40 hover:text-foreground"
          >
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
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
