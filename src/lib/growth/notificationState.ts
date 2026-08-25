/**
 * FlowBridge V27 §9 — notification presentation state (browser only).
 *
 * Dismiss, snooze, read and the growth-notice preference are PRESENTATION state.
 * They change what is shown and nothing canonical: no mission, no reward stage,
 * no ActionIntent, no transaction.
 */
import {
  EMPTY_NOTIFICATION_PRESENTATION,
  NOTIFICATION_SNOOZE_MS,
  type NotificationPresentation,
} from "./notifications";

const KEY = "flowbridge.v27.notifications";

function numMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries((v ?? {}) as Record<string, unknown>)) {
    if (typeof val === "number" && Number.isFinite(val)) out[k] = val;
  }
  return out;
}

const strs = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

export function readNotificationState(): NotificationPresentation {
  if (typeof window === "undefined") return EMPTY_NOTIFICATION_PRESENTATION;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_NOTIFICATION_PRESENTATION;
    const p = JSON.parse(raw) as Partial<NotificationPresentation>;
    return {
      dismissed: strs(p.dismissed),
      snoozedUntil: numMap(p.snoozedUntil),
      lastShownAt: numMap(p.lastShownAt),
      readIds: strs(p.readIds),
      growthEnabled: p.growthEnabled !== false,
    };
  } catch {
    return EMPTY_NOTIFICATION_PRESENTATION;
  }
}

function write(state: NotificationPresentation): NotificationPresentation {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* presentation-only */
    }
  }
  return state;
}

export function dismissNotification(id: string): NotificationPresentation {
  const s = readNotificationState();
  return write({ ...s, dismissed: Array.from(new Set([...s.dismissed, id])) });
}

export function snoozeNotification(id: string, ms = NOTIFICATION_SNOOZE_MS): NotificationPresentation {
  const s = readNotificationState();
  return write({ ...s, snoozedUntil: { ...s.snoozedUntil, [id]: Date.now() + ms } });
}

export function markNotificationsSeen(ids: readonly string[]): NotificationPresentation {
  const s = readNotificationState();
  return write({
    ...s,
    readIds: Array.from(new Set([...s.readIds, ...ids])),
  });
}

export function setGrowthNotificationsEnabled(enabled: boolean): NotificationPresentation {
  return write({ ...readNotificationState(), growthEnabled: enabled });
}

export function resetNotificationState(): NotificationPresentation {
  return write(EMPTY_NOTIFICATION_PRESENTATION);
}
