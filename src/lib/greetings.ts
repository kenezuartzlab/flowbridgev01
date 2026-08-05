/**
 * Alternate, changeable greetings for the app top bar.
 *
 * A greeting *style* is stored in preferences (`greeting`), and within a style
 * the user can tap the greeting to cycle to the next variant. Everything is
 * resolved after mount so SSR HTML never disagrees with the client.
 */
import { useCallback, useEffect, useState } from "react";
import { usePrefs } from "@/lib/prefs";

export type GreetingStyleId = "timeOfDay" | "friendly" | "crypto" | "minimal";

export const GREETING_STYLES: { id: GreetingStyleId; label: string }[] = [
  { id: "timeOfDay", label: "Time of day" },
  { id: "friendly", label: "Friendly" },
  { id: "crypto", label: "Crypto" },
  { id: "minimal", label: "Minimal" },
];

const FRIENDLY = ["Hey there", "Welcome back", "Nice to see you", "Hello again"];
const CRYPTO = ["Ready to bridge", "Flow state", "Chain on", "Let's swap"];
const MINIMAL = ["FlowBridge"];

function timeOfDayVariants(date = new Date()): string[] {
  const h = date.getHours();
  if (h < 5) return ["Good night", "Still up?", "Late flow"];
  if (h < 12) return ["Good morning", "Rise and bridge", "Morning"];
  if (h < 18) return ["Good afternoon", "Good day", "Afternoon"];
  return ["Good evening", "Evening", "Winding down"];
}

export function greetingVariants(style: GreetingStyleId): string[] {
  switch (style) {
    case "friendly":
      return FRIENDLY;
    case "crypto":
      return CRYPTO;
    case "minimal":
      return MINIMAL;
    default:
      return timeOfDayVariants();
  }
}

export const DEFAULT_GREETING_STYLE: GreetingStyleId = "timeOfDay";

/** SSR-safe greeting: renders the brand mark until mounted, then the variant. */
export function useGreeting() {
  const [prefs, savePrefs] = usePrefs();
  const style = (prefs.greeting as GreetingStyleId) || DEFAULT_GREETING_STYLE;
  const [mounted, setMounted] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => setMounted(true), []);
  useEffect(() => setIndex(0), [style]);

  const variants = greetingVariants(style);
  const next = useCallback(
    () => setIndex((i) => (i + 1) % Math.max(1, variants.length)),
    [variants.length],
  );

  return {
    greeting: mounted ? (variants[index % variants.length] ?? "FlowBridge") : "FlowBridge",
    next,
    style,
    setStyle: (id: GreetingStyleId) => savePrefs({ greeting: id }),
    canCycle: variants.length > 1,
  };
}
