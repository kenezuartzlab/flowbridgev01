/**
 * FlowBridge V28 §5/§12 — activation prompt presentation state (browser only).
 *
 * Dismiss, cooldown and the activation counters live here. Nothing in this file
 * touches canonical state: no reward stage, no mission, no ActionIntent.
 */
import {
  ACTIVATION_PROMPT_COOLDOWN_MS,
  EMPTY_ACTIVATION_PROMPT_STATE,
  type ActivationPromptState,
} from "./activationPrompt";

const KEY = "flowbridge.v28.activationPrompt";

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export function readActivationPromptState(): ActivationPromptState {
  if (typeof window === "undefined") return EMPTY_ACTIVATION_PROMPT_STATE;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_ACTIVATION_PROMPT_STATE;
    const p = JSON.parse(raw) as Partial<ActivationPromptState>;
    return {
      lastShownAt: num(p.lastShownAt),
      dismissedUntil: num(p.dismissedUntil),
      declineCount: num(p.declineCount) ?? 0,
      shownCount: num(p.shownCount) ?? 0,
      startedCount: num(p.startedCount) ?? 0,
    };
  } catch {
    return EMPTY_ACTIVATION_PROMPT_STATE;
  }
}

function write(state: ActivationPromptState): ActivationPromptState {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* presentation-only */
    }
  }
  return state;
}

export function recordActivationPromptShown(now = Date.now()): ActivationPromptState {
  const s = readActivationPromptState();
  return write({ ...s, lastShownAt: now, shownCount: s.shownCount + 1 });
}

export function recordActivationPromptDeclined(now = Date.now()): ActivationPromptState {
  const s = readActivationPromptState();
  return write({
    ...s,
    dismissedUntil: now + ACTIVATION_PROMPT_COOLDOWN_MS,
    declineCount: s.declineCount + 1,
  });
}

export function recordActivationPromptStarted(): ActivationPromptState {
  const s = readActivationPromptState();
  return write({ ...s, startedCount: s.startedCount + 1 });
}
