/**
 * FlowBridge V27 §4/§5 — first-time onboarding model (pure).
 *
 * Teaching only. An onboarding step can never create a Mission, an ActionIntent,
 * a reward record or a signature request: every step carries at most a
 * NAVIGATION target into an existing product surface that owns its own
 * authorization. No step may quote a balance, a reward or an earnings number —
 * the model has no access to any of them by construction.
 */

export const ONBOARDING_SCHEMA_VERSION = "flowbridge.onboarding/1" as const;
export const ONBOARDING_POLICY_VERSION = "V27" as const;

export const ONBOARDING_STEP_IDS = [
  "WELCOME",
  "EXPLORE",
  "EARN",
  "SUPPORT_BOT_CHAIN",
  "PERSONALIZE",
] as const;
export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number];

/** V27 §4 — at most three capability choices may ever be shown at once. */
export const MAX_CAPABILITY_CHOICES = 3;

export interface OnboardingCapability {
  id: "TRADE_BRIDGE" | "EARN_STAKE" | "FLOW_AI";
  label: string;
  /** One plain-English sentence. Any crypto term is explained on first use. */
  body: string;
  href: "/trade" | "/earn" | "/assistant";
}

export const ONBOARDING_CAPABILITIES: readonly OnboardingCapability[] = [
  {
    id: "TRADE_BRIDGE",
    label: "Trade & Bridge",
    body: "Swap one token for another, or bridge — move value between two networks — using supported BOT Chain routes.",
    href: "/trade",
  },
  {
    id: "EARN_STAKE",
    label: "Earn & Stake",
    body: "Collect FLOW Points from real product activity, and stake — lock FLOW in a published vault — when you choose to.",
    href: "/earn",
  },
  {
    id: "FLOW_AI",
    label: "Flow AI",
    body: "Ask questions in plain English. Flow AI reads and explains your FlowBridge data; it never signs anything for you.",
    href: "/assistant",
  },
];

export interface OnboardingStep {
  id: OnboardingStepId;
  index: number;
  eyebrow: string;
  title: string;
  /** One idea, short sentence. */
  message: string;
  /** Optional supporting lines — still short, still plain English. */
  points: readonly string[];
  /** Label of the forward control. */
  actionLabel: string;
  /** Navigation-only destination, or null when the step just advances. */
  href: string | null;
  /** True on the step that presents the capability choices (max 3). */
  showsCapabilities?: boolean;
  /** V27 §8 — the truthful ecosystem reason, or null when there isn't one. */
  whyBotChain: string | null;
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    id: "WELCOME",
    index: 0,
    eyebrow: "Welcome",
    title: "FlowBridge in one minute",
    message: "FlowBridge helps you move, earn, learn and grow across BOT Chain.",
    points: [
      "Nothing here spends your money. You approve every action in your own wallet.",
      "A wallet is the app that holds your tokens and signs your approvals.",
    ],
    actionLabel: "Start",
    href: null,
    whyBotChain: null,
  },
  {
    id: "EXPLORE",
    index: 1,
    eyebrow: "Explore",
    title: "One place for everything",
    message: "Trade, bridge, earn, stake and discover ecosystem activity from one place.",
    points: ["Pick where you want to start. You can change your mind any time."],
    actionLabel: "See what I can do",
    href: null,
    showsCapabilities: true,
    whyBotChain: null,
  },
  {
    id: "EARN",
    index: 2,
    eyebrow: "Earn",
    title: "How earning really works",
    message: "Learn the real ways rewards can be earned and what rules apply.",
    points: [
      "FLOW Points come from verified product activity — never from opening a screen.",
      "Campaign PTS are a separate scoreboard and never convert into FLOW.",
      "We never show guaranteed earnings. Estimates are always labelled Preview.",
    ],
    actionLabel: "Show earning options",
    href: "/learn",
    whyBotChain: null,
  },
  {
    id: "SUPPORT_BOT_CHAIN",
    index: 3,
    eyebrow: "Support BOT Chain",
    title: "Why your activity matters",
    message:
      "Real participation can support ecosystem activity, partners and on-chain usage.",
    points: [
      "Swaps and bridges you confirm are real on-chain transactions on supported BOT Chain routes.",
      "Campaigns and partner discovery send real users to real ecosystem products.",
    ],
    actionLabel: "How it helps",
    href: "/learn",
    whyBotChain:
      "When you confirm a swap, bridge or stake, that transaction settles on BOT Chain and is verifiable on the explorer. That is real network usage — not a click counter.",
  },
  {
    id: "PERSONALIZE",
    index: 4,
    eyebrow: "Personalize",
    title: "Make it yours",
    message:
      "Connect a wallet for personalized read-only guidance. Signing still happens only when you choose an action.",
    points: [
      "Read-only means FlowBridge looks at public balances and your FlowBridge records to explain your options.",
      "You can skip this and explore first.",
    ],
    actionLabel: "Connect",
    href: "/account",
    whyBotChain: null,
  },
];

export function onboardingStep(id: OnboardingStepId): OnboardingStep {
  return ONBOARDING_STEPS.find((s) => s.id === id) ?? ONBOARDING_STEPS[0]!;
}

export function nextOnboardingStepId(id: OnboardingStepId): OnboardingStepId | null {
  const i = ONBOARDING_STEPS.findIndex((s) => s.id === id);
  return ONBOARDING_STEPS[i + 1]?.id ?? null;
}

export function onboardingPercent(id: OnboardingStepId): number {
  const step = onboardingStep(id);
  return Math.round(((step.index + 1) / ONBOARDING_STEPS.length) * 100);
}

/** Constants a test can assert: onboarding is economically inert. */
export const ONBOARDING_AUTHORITY = {
  createsMission: false,
  createsActionIntent: false,
  signsTransaction: false,
  showsBalances: false,
} as const;
