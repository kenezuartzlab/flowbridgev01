/**
 * FlowBridge V27 §4 — onboarding progress as PRESENTATION state only.
 *
 * Stored in browser localStorage. Completing or skipping onboarding changes
 * nothing canonical: no mission, no reward stage, no ActionIntent. Users can
 * reopen it at any time from the Learn centre.
 */
import { ONBOARDING_STEP_IDS, type OnboardingStepId } from "./onboarding";

const KEY = "flowbridge.v27.onboarding";

export interface OnboardingState {
  /** Undefined until the user has seen at least one step. */
  lastStepId: OnboardingStepId | null;
  completedAt: number | null;
  skippedAt: number | null;
  /** Set when the user explicitly reopens it from Learn/Help. */
  reopenedAt: number | null;
}

export const EMPTY_ONBOARDING_STATE: OnboardingState = {
  lastStepId: null,
  completedAt: null,
  skippedAt: null,
  reopenedAt: null,
};

function isStepId(v: unknown): v is OnboardingStepId {
  return typeof v === "string" && (ONBOARDING_STEP_IDS as readonly string[]).includes(v);
}

export function readOnboardingState(): OnboardingState {
  if (typeof window === "undefined") return EMPTY_ONBOARDING_STATE;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_ONBOARDING_STATE;
    const p = JSON.parse(raw) as Partial<OnboardingState>;
    return {
      lastStepId: isStepId(p.lastStepId) ? p.lastStepId : null,
      completedAt: typeof p.completedAt === "number" ? p.completedAt : null,
      skippedAt: typeof p.skippedAt === "number" ? p.skippedAt : null,
      reopenedAt: typeof p.reopenedAt === "number" ? p.reopenedAt : null,
    };
  } catch {
    return EMPTY_ONBOARDING_STATE;
  }
}

function write(state: OnboardingState): OnboardingState {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* presentation-only */
    }
  }
  return state;
}

export function markOnboardingStep(id: OnboardingStepId): OnboardingState {
  return write({ ...readOnboardingState(), lastStepId: id });
}

export function completeOnboarding(): OnboardingState {
  return write({ ...readOnboardingState(), completedAt: Date.now() });
}

export function skipOnboarding(): OnboardingState {
  return write({ ...readOnboardingState(), skippedAt: Date.now() });
}

export function reopenOnboarding(): OnboardingState {
  return write({
    ...readOnboardingState(),
    completedAt: null,
    skippedAt: null,
    lastStepId: null,
    reopenedAt: Date.now(),
  });
}

/** Pure: should the overlay auto-open for this state? */
export function shouldAutoOpenOnboarding(state: OnboardingState): boolean {
  if (state.completedAt) return false;
  if (state.skippedAt) return false;
  return true;
}
