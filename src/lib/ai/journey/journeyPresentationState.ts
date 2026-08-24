/**
 * FlowBridge V26 §7/§8/§10 — skip / dismiss / snooze as PRESENTATION ONLY.
 *
 * Stored in browser localStorage. It changes what is shown and nothing else: no
 * canonical opportunity is dismissed, no mission is touched, no reward stage is
 * altered, and a dismissed journey becomes visible again only if the user resets
 * it. Snoozes are bounded, never a hidden countdown used for pressure.
 */
import {
  EMPTY_JOURNEY_PRESENTATION,
  JOURNEY_IDS,
  type JourneyId,
  type JourneyPresentationState,
} from "./journeyTypes";

const KEY = "flowbridge.v26.journeys";
export const JOURNEY_SNOOZE_MS = 24 * 60 * 60 * 1000;

function isJourneyId(v: unknown): v is JourneyId {
  return typeof v === "string" && (JOURNEY_IDS as readonly string[]).includes(v);
}

export function readJourneyPresentation(): JourneyPresentationState {
  if (typeof window === "undefined") return EMPTY_JOURNEY_PRESENTATION;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_JOURNEY_PRESENTATION;
    const parsed = JSON.parse(raw) as Partial<JourneyPresentationState>;
    const snoozedUntil: Partial<Record<JourneyId, number>> = {};
    for (const [k, v] of Object.entries(parsed.snoozedUntil ?? {})) {
      if (isJourneyId(k) && typeof v === "number") snoozedUntil[k] = v;
    }
    return {
      dismissed: (parsed.dismissed ?? []).filter(isJourneyId),
      skipped: (parsed.skipped ?? []).filter(isJourneyId),
      snoozedUntil,
    };
  } catch {
    return EMPTY_JOURNEY_PRESENTATION;
  }
}

function write(state: JourneyPresentationState): JourneyPresentationState {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* presentation-only; a storage failure must never break the surface */
    }
  }
  return state;
}

export function dismissJourney(id: JourneyId): JourneyPresentationState {
  const s = readJourneyPresentation();
  return write({ ...s, dismissed: Array.from(new Set([...s.dismissed, id])) });
}

export function skipJourney(id: JourneyId): JourneyPresentationState {
  const s = readJourneyPresentation();
  return write({ ...s, skipped: Array.from(new Set([...s.skipped, id])) });
}

export function snoozeJourney(id: JourneyId, ms = JOURNEY_SNOOZE_MS): JourneyPresentationState {
  const s = readJourneyPresentation();
  return write({ ...s, snoozedUntil: { ...s.snoozedUntil, [id]: Date.now() + ms } });
}

export function resetJourneyPresentation(): JourneyPresentationState {
  return write(EMPTY_JOURNEY_PRESENTATION);
}
