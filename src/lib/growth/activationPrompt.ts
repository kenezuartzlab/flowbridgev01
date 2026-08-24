/**
 * FlowBridge V28 §5/§11/§12 — the post-swap/bridge account encouragement rules.
 *
 * Pure and bounded. The prompt is shown AFTER the real outcome is displayed, it
 * never blocks or hides a transaction result, it is not shown on every
 * transaction, and "Not now" is respected for a real cooldown.
 */

export const ACTIVATION_PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
/** Shown at most this often even when the user never answers. */
export const ACTIVATION_PROMPT_MIN_GAP_MS = 24 * 60 * 60 * 1000;
/** After this many declines we stop asking entirely. */
export const ACTIVATION_PROMPT_MAX_DECLINES = 3;

export interface ActivationPromptState {
  lastShownAt: number | null;
  dismissedUntil: number | null;
  declineCount: number;
  /** Presentation-only counters for V28 §12 activation analytics. */
  shownCount: number;
  startedCount: number;
}

export const EMPTY_ACTIVATION_PROMPT_STATE: ActivationPromptState = {
  lastShownAt: null,
  dismissedUntil: null,
  declineCount: 0,
  shownCount: 0,
  startedCount: 0,
};

export interface ActivationPromptInput {
  /** Only a real, displayed success may trigger the follow-up. */
  outcomeSuccessful: boolean;
  signedIn: boolean;
  emailVerified: boolean;
  walletBound: boolean;
  state: ActivationPromptState;
  now?: number;
}

export interface ActivationPromptDecision {
  show: boolean;
  reason:
    | "SHOW"
    | "OUTCOME_NOT_SUCCESSFUL"
    | "ACCOUNT_ALREADY_COMPLETE"
    | "USER_DECLINED_COOLDOWN"
    | "FREQUENCY_BOUNDED"
    | "DECLINED_TOO_OFTEN";
}

export function shouldShowActivationPrompt(
  input: ActivationPromptInput,
): ActivationPromptDecision {
  const now = input.now ?? Date.now();
  if (!input.outcomeSuccessful) return { show: false, reason: "OUTCOME_NOT_SUCCESSFUL" };
  if (input.signedIn && input.emailVerified && input.walletBound) {
    return { show: false, reason: "ACCOUNT_ALREADY_COMPLETE" };
  }
  if (input.state.declineCount >= ACTIVATION_PROMPT_MAX_DECLINES) {
    return { show: false, reason: "DECLINED_TOO_OFTEN" };
  }
  const until = input.state.dismissedUntil;
  if (typeof until === "number" && until > now) {
    return { show: false, reason: "USER_DECLINED_COOLDOWN" };
  }
  const last = input.state.lastShownAt;
  if (typeof last === "number" && now - last < ACTIVATION_PROMPT_MIN_GAP_MS) {
    return { show: false, reason: "FREQUENCY_BOUNDED" };
  }
  return { show: true, reason: "SHOW" };
}

/** The prompt copy. Honest value, no urgency, no scarcity, no fake reward. */
export const ACTIVATION_PROMPT_COPY = {
  eyebrow: "Your transaction is done",
  title: "Keep your FlowBridge progress together",
  body: "Verifying your email and binding your wallet lets FlowBridge connect this activity to your account, so eligible reward and campaign steps can be shown accurately where current rules allow.",
  ctaLabel: "Verify my account",
  declineLabel: "Not now",
  note: "This is optional. Swapping and bridging keep working either way, and verifying does not create a reward on its own.",
} as const;

export const ACTIVATION_PROMPT_AUTHORITY = {
  blocksOutcome: false,
  createsMission: false,
  createsActionIntent: false,
  signsTransaction: false,
} as const;
