/**
 * FlowBridge V9.3 — adaptive shell mode.
 *
 * Root cause of the crowded tablet/narrow-desktop header: the shell treated
 * every viewport >= 768px as "full desktop" and forced the inline four-item
 * navigation into whatever horizontal space was left, colliding with the
 * environment chip and sign-in/wallet utilities.
 *
 * V9.3 decides from BOTH the viewport width AND the *measured* shell width, so
 * a preview iframe, tablet split view or narrow browser window collapses to the
 * clean compact header BEFORE anything can wrap.
 */
import { useEffect, useState, type RefObject } from "react";

export type ShellMode = "mobile" | "compact" | "desktop";

/** Minimum viewport width before the inline desktop navigation is allowed. */
export const DESKTOP_VIEWPORT_MIN = 1200;
/** Minimum measured shell width before the inline desktop navigation is allowed. */
export const DESKTOP_SHELL_MIN = 1080;
/** Below this viewport width the mobile bottom navigation owns navigation. */
export const MOBILE_MAX = 768;

export function computeShellMode(viewportWidth: number, shellWidth: number): ShellMode {
  if (viewportWidth < MOBILE_MAX) return "mobile";
  if (viewportWidth >= DESKTOP_VIEWPORT_MIN && shellWidth >= DESKTOP_SHELL_MIN) return "desktop";
  return "compact";
}

export function useShellMode(ref: RefObject<HTMLElement | null>): ShellMode {
  const [mode, setMode] = useState<ShellMode>("compact");

  useEffect(() => {
    const measure = () => {
      const shellWidth = ref.current?.getBoundingClientRect().width ?? window.innerWidth;
      setMode(computeShellMode(window.innerWidth, shellWidth));
    };
    measure();

    window.addEventListener("resize", measure);
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined" && ref.current) {
      ro = new ResizeObserver(measure);
      ro.observe(ref.current);
    }
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [ref]);

  return mode;
}
