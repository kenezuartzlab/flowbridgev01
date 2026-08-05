/**
 * App-wide user preferences (display currency, language, notifications).
 *
 * Stored in localStorage under `fb_prefs_v1` and exposed through a tiny
 * subscribe store so every component — and the shared number formatter —
 * reacts to a change immediately.
 */
import { useEffect, useState } from "react";
import { setDisplayCurrency, setDisplayLocale } from "@/lib/format";

export const PREF_KEY = "fb_prefs_v1";

export const CURRENCIES = [
  { code: "USD", symbol: "$", rate: 1 },
  { code: "EUR", symbol: "€", rate: 0.92 },
  { code: "PHP", symbol: "₱", rate: 58.2 },
  { code: "JPY", symbol: "¥", rate: 157 },
  { code: "INR", symbol: "₹", rate: 83.4 },
  { code: "GBP", symbol: "£", rate: 0.78 },
] as const;

export const LANGUAGES = [
  { code: "en", locale: "en-US", label: "English" },
  { code: "fil", locale: "fil-PH", label: "Filipino" },
  { code: "es", locale: "es-ES", label: "Español" },
  { code: "zh", locale: "zh-CN", label: "中文" },
  { code: "ja", locale: "ja-JP", label: "日本語" },
] as const;

export type Prefs = {
  notifications: boolean;
  marketing: boolean;
  currency: string;
  language: string;
};

export const DEFAULT_PREFS: Prefs = {
  notifications: true,
  marketing: false,
  currency: "USD",
  language: "en",
};

let current: Prefs = DEFAULT_PREFS;
let hydrated = false;
const listeners = new Set<(p: Prefs) => void>();

function apply(p: Prefs) {
  const cur = CURRENCIES.find((c) => c.code === p.currency) ?? CURRENCIES[0];
  const lang = LANGUAGES.find((l) => l.code === p.language) ?? LANGUAGES[0];
  setDisplayCurrency(cur.code, cur.rate);
  setDisplayLocale(lang.locale);
}

export function readPrefs(): Prefs {
  if (hydrated || typeof window === "undefined") return current;
  try {
    const raw = window.localStorage.getItem(PREF_KEY);
    if (raw) current = { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    /* storage unavailable */
  }
  hydrated = true;
  apply(current);
  return current;
}

export function writePrefs(patch: Partial<Prefs>): Prefs {
  current = { ...readPrefs(), ...patch };
  apply(current);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(PREF_KEY, JSON.stringify(current));
    } catch {
      /* storage unavailable */
    }
  }
  listeners.forEach((fn) => fn(current));
  return current;
}

export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void] {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  useEffect(() => {
    setPrefs(readPrefs());
    const fn = (p: Prefs) => setPrefs(p);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  return [prefs, writePrefs];
}

export function currencyMeta(code: string) {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}

export function languageMeta(code: string) {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}
