/** V34 — opt-in watch for an unavailable route. Never trades or signs. */
import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { addRouteWatch, readRouteWatches, removeRouteWatch, saveRouteWatches, watchKey } from "@/lib/growth/routeWatch";

export function WatchRouteButton({ from, to, chainId }: { from: string; to: string; chainId: number }) {
  const key = watchKey({ from, to, chainId });
  const [on, setOn] = useState(false);
  useEffect(() => setOn(readRouteWatches().some((w) => watchKey(w) === key)), [key]);
  const toggle = () => {
    const list = readRouteWatches();
    saveRouteWatches(on ? removeRouteWatch(list, key) : addRouteWatch(list, { from, to, chainId }));
    setOn(!on);
  };
  return (
    <button type="button" onClick={toggle} aria-pressed={on}
      className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-hairline text-[12px] font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {on ? <BellOff aria-hidden className="h-4 w-4" /> : <Bell aria-hidden className="h-4 w-4" />}
      {on ? `Stop watching ${from} → ${to}` : `Notify me when ${from} → ${to} is available`}
    </button>
  );
}
