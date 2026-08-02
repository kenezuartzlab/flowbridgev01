// Client-side banner analytics. Batches impression/click pings so a rotating
// carousel never floods the network, and de-dupes impressions per page view.
import type { BannerSurfaceKey } from "@/lib/config/appConfig";

type Kind = "impression" | "click";
interface Event {
  surface: BannerSurfaceKey;
  slideId: string;
  kind: Kind;
}

const queue: Event[] = [];
const seenImpressions = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  flushTimer = null;
  if (typeof window === "undefined" || queue.length === 0) return;
  const events = queue.splice(0, queue.length);
  const body = JSON.stringify({ events });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/banner-events", new Blob([body], { type: "application/json" }));
      return;
    }
  } catch {
    /* fall through to fetch */
  }
  void fetch("/api/banner-events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

function push(event: Event) {
  if (typeof window === "undefined" || !event.slideId) return;
  queue.push(event);
  if (queue.length >= 20) return flush();
  if (!flushTimer) flushTimer = setTimeout(flush, 2500);
}

/** Records one view per slide per page view. */
export function trackBannerImpression(surface: BannerSurfaceKey, slideId: string) {
  const key = `${surface}::${slideId}`;
  if (seenImpressions.has(key)) return;
  seenImpressions.add(key);
  push({ surface, slideId, kind: "impression" });
}

/** Records a click and flushes immediately (navigation may follow). */
export function trackBannerClick(surface: BannerSurfaceKey, slideId: string) {
  push({ surface, slideId, kind: "click" });
  flush();
}
