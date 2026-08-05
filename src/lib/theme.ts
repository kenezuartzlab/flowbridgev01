/**
 * Single source of truth for the light/dark theme.
 *
 * The class is applied to <html> (`html.light`) by an inline script in the root
 * shell so there is no flash before hydration; this module keeps React in sync
 * and persists the choice to localStorage.
 */
import { useEffect, useState } from "react";

export type Theme = "dark" | "light";
export const THEME_KEY = "fb_theme";

const listeners = new Set<(t: Theme) => void>();

export function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  if (document.documentElement.classList.contains("light")) return "light";
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* storage unavailable */
  }
  return "dark";
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("light", theme === "light");
  document.documentElement.style.colorScheme = theme;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((fn) => fn(theme));
}

/** Reactive theme accessor shared by every screen. */
export function useTheme(): [Theme, (t?: Theme) => void] {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(readTheme());
    const fn = (t: Theme) => setTheme(t);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  const set = (next?: Theme) => {
    const value = next ?? (readTheme() === "dark" ? "light" : "dark");
    applyTheme(value);
    setTheme(value);
  };

  return [theme, set];
}

/** Inline bootstrap script — keeps the stored theme across reloads/routes. */
export const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t!=='light'&&t!=='dark'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}if(t==='light'){document.documentElement.classList.add('light');}document.documentElement.style.colorScheme=t;}catch(e){}})();`;
