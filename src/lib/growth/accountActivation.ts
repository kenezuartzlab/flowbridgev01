/**
 * FlowBridge V28 §3/§4/§9/§10 — the verified-account activation model (pure).
 *
 * This module decides WHAT to say and WHICH single action to offer while a user
 * completes their FlowBridge account (email verification, then wallet binding).
 *
 * Hard rules encoded here:
 *  - Activation is TEACHING + NAVIGATION. It creates no Mission, no prepared
 *    action, no transaction and no reward. Completing it never changes balances.
 *  - Verification is never presented as required for swapping or bridging.
 *  - Benefits listed are only the ones current FlowBridge rules already support.
 *  - Exactly one primary action at a time; no competing buttons.
 */

export const ACTIVATION_SCHEMA_VERSION = "flowbridge.activation/1" as const;
export const ACTIVATION_POLICY_VERSION = "V28" as const;

export const ACTIVATION_STATES = [
  "PUBLIC",
  "EMAIL_UNVERIFIED",
  "WALLET_UNBOUND",
  "READY",
  "REQUIREMENT_MISSING",
  "ACTIVE_MISSION",
] as const;
export type ActivationState = (typeof ACTIVATION_STATES)[number];

export const ACTIVATION_STEP_IDS = ["VERIFY_EMAIL", "BIND_WALLET", "EXPLORE_BENEFITS"] as const;
export type ActivationStepId = (typeof ACTIVATION_STEP_IDS)[number];

export type ActivationActionKind =
  | "SIGN_IN"
  | "SEND_VERIFICATION_EMAIL"
  | "BIND_WALLET"
  | "EXPLORE"
  | "CONTINUE_MISSION"
  | "COMPLETE_REQUIREMENT";

export interface ActivationStep {
  id: ActivationStepId;
  title: string;
  /** One plain-English idea. No jargon, no internal names. */
  body: string;
  done: boolean;
}

export interface ActivationAction {
  kind: ActivationActionKind;
  label: string;
  /** Navigation target for link actions; `null` for in-card actions. */
  href: string | null;
}

export interface ActivationBenefit {
  id: string;
  title: string;
  /** Simple explanation (V28 §4). */
  body: string;
  /** The truth rule that bounds the promise. */
  limit: string;
}

/** V28 §4 — the closed benefit list. Nothing outside current rules. */
export const ACTIVATION_BENEFITS: readonly ActivationBenefit[] = [
  {
    id: "REWARD_READINESS",
    title: "Reward readiness",
    body: "See whether your FLOW Points can be converted or claimed, and exactly which requirement is still missing.",
    limit: "Only shows what current FlowBridge reward rules support. It does not add FLOW.",
  },
  {
    id: "WALLET_LINKED_PROGRESS",
    title: "Wallet-linked progress",
    body: "Your eligible account progress stays connected to your bound wallet — the wallet FlowBridge uses for your account rewards and verified progress.",
    limit: "Binding proves which wallet your account uses. It never claims ownership of funds.",
  },
  {
    id: "REFERRALS_CAMPAIGNS",
    title: "Referrals and campaigns",
    body: "Qualify for account-based referral or campaign steps where verification is part of the current rule.",
    limit: "There is no signup bonus. Each campaign or referral rule still applies in full.",
  },
  {
    id: "SMARTER_FLOW_AI",
    title: "Smarter Flow AI",
    body: "Flow AI can give account-specific guidance once FlowBridge can safely identify the right account and wallet.",
    limit: "Guidance never changes balances, rewards or who can approve a transaction.",
  },
  {
    id: "CONTINUITY",
    title: "Better continuity",
    body: "Come back later and pick up the same journeys, rewards state and verified progress.",
    limit: "Only features that already exist today are included.",
  },
];

/** V28 §9/§15 — the honest scope note shown wherever we ask for verification. */
export const ACTIVATION_TRUTH_NOTE =
  "Swapping and bridging stay open without verification. Verification and wallet binding are prerequisites in parts of the existing reward flow — they are not a reward by themselves.";

export interface ActivationInput {
  signedIn: boolean;
  emailVerified: boolean;
  walletBound: boolean;
  /** Canonical reward-state read. `false` only when a real rule is unmet. */
  rewardRequirementsMet: boolean;
  /** The exact missing requirement label from canonical reward state. */
  missingRequirementLabel: string | null;
  /** Read-only active mission context (title + its own surface). */
  activeMissionTitle: string | null;
  activeMissionHref: string | null;
}

export interface ActivationView {
  schemaVersion: typeof ACTIVATION_SCHEMA_VERSION;
  policyVersion: typeof ACTIVATION_POLICY_VERSION;
  state: ActivationState;
  /** Answers "why should I do this?" before asking for anything. */
  headline: string;
  message: string;
  steps: readonly ActivationStep[];
  completed: number;
  total: number;
  percent: number;
  /** Exactly one dominant action (V28 §3). */
  primary: ActivationAction;
  /** Quiet alternative; never a second dominant action. */
  secondary: ActivationAction | null;
  benefits: readonly ActivationBenefit[];
  truthNote: string;
  /** True only when both account steps are canonically complete. */
  accountComplete: boolean;
  /** Constants a test can assert (V28 §14). */
  createsMission: false;
  createsActionIntent: false;
  signsTransaction: false;
  grantsReward: false;
}

const STEP_COPY: Record<ActivationStepId, { title: string; body: string }> = {
  VERIFY_EMAIL: {
    title: "Verify email",
    body: "Confirm the email you signed in with, so FlowBridge knows this account is really yours.",
  },
  BIND_WALLET: {
    title: "Bind wallet",
    body: "Choose the wallet FlowBridge should recognize for your account. Bound wallet = the wallet used for your account rewards and verified progress.",
  },
  EXPLORE_BENEFITS: {
    title: "Explore your unlocked benefits",
    body: "See your real rewards state, eligible campaigns and next best steps — based on your own account.",
  },
};

function step(id: ActivationStepId, done: boolean): ActivationStep {
  return { id, ...STEP_COPY[id], done };
}

/**
 * Deterministic: the same canonical inputs always produce the same state,
 * the same steps and the same single primary action (V28 §10).
 */
export function resolveActivation(input: ActivationInput): ActivationView {
  const emailVerified = input.signedIn && input.emailVerified;
  const walletBound = input.signedIn && input.walletBound;
  const accountComplete = emailVerified && walletBound;

  const steps = [
    step("VERIFY_EMAIL", emailVerified),
    step("BIND_WALLET", walletBound),
    step("EXPLORE_BENEFITS", accountComplete),
  ];
  const completed = steps.filter((s) => s.done).length;

  let state: ActivationState;
  let headline: string;
  let message: string;
  let primary: ActivationAction;
  let secondary: ActivationAction | null = null;

  if (!input.signedIn) {
    state = "PUBLIC";
    headline = "Explore FlowBridge, then unlock your account";
    message =
      "Trading and bridging are open to everyone. A verified FlowBridge account is what connects your activity to the right wallet, so eligible rewards and campaigns can be shown accurately.";
    primary = { kind: "SIGN_IN", label: "Create or verify account", href: "/account" };
    secondary = { kind: "EXPLORE", label: "See what you can unlock", href: "/learn" };
  } else if (!emailVerified) {
    state = "EMAIL_UNVERIFIED";
    headline = "Verify your email to continue account setup";
    message =
      "Verification is a simple email confirmation — never a wallet transaction. It lets FlowBridge link your account activity to the correct wallet and show eligible rewards honestly.";
    primary = { kind: "SEND_VERIFICATION_EMAIL", label: "Verify email", href: null };
  } else if (!walletBound) {
    state = "WALLET_UNBOUND";
    headline = "Connect your account to the wallet you use";
    message =
      "Bind the wallet you want FlowBridge to recognize for this account. Binding uses the existing secure account flow and never moves funds or asks for a seed phrase.";
    primary = { kind: "BIND_WALLET", label: "Bind wallet", href: "/rewards#bind" };
  } else if (input.activeMissionTitle) {
    state = "ACTIVE_MISSION";
    headline = "Your FlowBridge account is ready";
    message = `You already have something in progress: ${input.activeMissionTitle}. Each step you take is still confirmed in your own wallet.`;
    primary = {
      kind: "CONTINUE_MISSION",
      label: "Continue mission",
      href: input.activeMissionHref ?? "/assistant",
    };
    secondary = { kind: "EXPLORE", label: "Discover BOT Chain", href: "/discover" };
  } else if (!input.rewardRequirementsMet && input.missingRequirementLabel) {
    state = "REQUIREMENT_MISSING";
    headline = "One reward requirement is still missing";
    message = `Your account is verified and bound. Current reward rules still need: ${input.missingRequirementLabel}.`;
    primary = { kind: "COMPLETE_REQUIREMENT", label: "Complete next requirement", href: "/rewards" };
    secondary = { kind: "EXPLORE", label: "Discover BOT Chain", href: "/discover" };
  } else {
    state = "READY";
    headline = "Your FlowBridge account is ready";
    message =
      "Email verified and wallet bound. FlowBridge can now show your real rewards state, eligible campaigns and next best opportunities.";
    primary = { kind: "EXPLORE", label: "Explore opportunities", href: "/discover" };
    secondary = { kind: "EXPLORE", label: "Ways to earn", href: "/learn" };
  }

  return {
    schemaVersion: ACTIVATION_SCHEMA_VERSION,
    policyVersion: ACTIVATION_POLICY_VERSION,
    state,
    headline,
    message,
    steps,
    completed,
    total: steps.length,
    percent: Math.round((completed / steps.length) * 100),
    primary,
    secondary,
    benefits: ACTIVATION_BENEFITS,
    truthNote: ACTIVATION_TRUTH_NOTE,
    accountComplete,
    createsMission: false,
    createsActionIntent: false,
    signsTransaction: false,
    grantsReward: false,
  };
}

/** True when the activation card has anything useful left to say. */
export function activationNeeded(view: ActivationView): boolean {
  return view.state !== "READY" && view.state !== "ACTIVE_MISSION";
}

export const ACTIVATION_AUTHORITY = {
  createsMission: false,
  createsActionIntent: false,
  signsTransaction: false,
  grantsReward: false,
  blocksTrading: false,
} as const;
