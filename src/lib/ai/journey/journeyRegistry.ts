/**
 * FlowBridge V26 §4 — the server-approved JourneyDefinition registry.
 *
 * This list is CLOSED. Flow AI may re-word an explanation over these approved
 * facts, but it can never invent a journey, a stage, or a destination. No stage
 * here exposes a transaction control: every CTA hands off to an existing product
 * surface which owns its own authorization flow.
 */
import {
  type JourneyContext,
  type JourneyDefinition,
  type JourneyStageStatus,
} from "./journeyTypes";

const hasFlowPoints = (c: JourneyContext) => c.flowPointsTotal > 0;
const hasConvertible = (c: JourneyContext) =>
  c.convertibleFlowPoints > 0 && c.convertibleFlowPoints >= c.conversionMinimum;
const hasClaimable = (c: JourneyContext) => (c.claimableFlow ?? 0) > 0;
const hasIdleFlow = (c: JourneyContext) => (c.walletFlow ?? 0) > 0;

/** DISCOVER — public/new actor. Facts only, never a fabricated balance. */
const DISCOVER: JourneyDefinition = {
  journeyId: "DISCOVER_FLOWBRIDGE",
  version: "v26.1",
  title: "Discover FlowBridge",
  summary:
    "Three things FlowBridge does today: trade and bridge on BOT Chain, earn FLOW Points and stake FLOW, and ask Flow AI what is actually live.",
  displayPriority: 10,
  urgent: false,
  eligible: (c) => !c.signedIn || (!c.hasHistory && !c.walletBound),
  destinations: ["/", "/rewards", "/assistant", "/campaigns"],
  stages: [
    {
      id: "trade",
      title: "Trade & bridge",
      body: "Swap on BOT Chain and bridge USDT between BOT and BNB. Prices and routes are public — you can read them before signing in.",
      status: () => "EXPLORE",
    },
    {
      id: "earn",
      title: "Earn & stake",
      body: "Verified swaps accrue FLOW Points. Points convert to claimable FLOW only through an explicit, canonical conversion, and FLOW can then be staked.",
      status: (c) => (hasFlowPoints(c) ? "COMPLETED" : "EXPLORE"),
    },
    {
      id: "flow-ai",
      title: "Flow AI",
      body: "Flow AI reads your canonical state and explains options. It never signs, never moves funds, and every transaction stays a separate wallet confirmation.",
      status: () => "EXPLORE",
    },
    {
      id: "connect",
      title: "Connect for personalized reads",
      body: "Signing in and binding a wallet lets Flow AI read your own rewards, staking and mission state. Signing a transaction stays a per-action choice.",
      status: (c) => (c.walletBound ? "COMPLETED" : c.signedIn ? "READY" : "EXPLORE"),
    },
  ],
  primaryCta: (c) => (c.signedIn ? { label: "Open rewards", href: "/rewards" } : { label: "Explore trading", href: "/" }),
  secondaryCta: () => ({ label: "Ask Flow AI", href: "/assistant", tone: "ghost" }),
  completionEvidence:
    "Nothing to prove: this journey is educational and holds no economic state.",
  prompts: [
    "What can FlowBridge do for me?",
    "What's actually live on BOT Chain today?",
    "How do FLOW Points work?",
  ],
};

/** FIRST_ACTION — connected, no canonical history yet. */
const FIRST_ACTION: JourneyDefinition = {
  journeyId: "FIRST_ACTION",
  version: "v26.1",
  title: "Your first useful action",
  summary:
    "Based on what is canonically available to you right now, here is one supported action worth doing first.",
  displayPriority: 40,
  urgent: false,
  eligible: (c) =>
    c.signedIn && c.activeMissionCount === 0 && !c.hasHistory && !hasClaimable(c) && !hasIdleFlow(c),
  destinations: ["/", "/rewards", "/campaigns", "/assistant"],
  stages: [
    {
      id: "bind",
      title: "Bind a wallet",
      body: "A bound wallet is what makes rewards, staking and mission state readable for you.",
      status: (c) => (c.walletBound ? "COMPLETED" : "NEEDS_YOU"),
    },
    {
      id: "swap",
      title: "Make a verified swap",
      body: "A swap that settles on BOT Chain is the canonical event that accrues FLOW Points. FlowBridge only counts verified settlements.",
      status: (c) => (hasFlowPoints(c) ? "COMPLETED" : c.walletBound ? "READY" : "EXPLORE"),
    },
    {
      id: "points",
      title: "Watch FLOW Points accrue",
      body: "Points appear after the swap is verified on chain, not when a page loads.",
      status: (c) => (hasFlowPoints(c) ? "COMPLETED" : "EXPLORE"),
    },
  ],
  primaryCta: (c) => (c.walletBound ? { label: "Open trade", href: "/" } : { label: "Bind wallet", href: "/rewards" }),
  secondaryCta: () => ({ label: "See campaigns", href: "/campaigns", tone: "ghost" }),
  completionEvidence:
    "A verified on-chain swap settlement recorded as canonical activity — never a click.",
  relatedOpportunityKinds: ["SWAP_TO_EARN", "CAMPAIGN_TASK"],
  prompts: [
    "What should I do first?",
    "Why is this recommended?",
    "What will my wallet confirm?",
  ],
};

/** REWARDS_TO_FLOW — points → conversion → claim, stages never conflated. */
const REWARDS: JourneyDefinition = {
  journeyId: "REWARDS_TO_FLOW",
  version: "v26.1",
  title: "From FLOW Points to FLOW",
  summary:
    "FLOW Points, convertible points, claimable FLOW, claimed FLOW and wallet FLOW are five different things. This walks the real order.",
  displayPriority: 60,
  urgent: false,
  eligible: (c) => c.signedIn && (hasFlowPoints(c) || hasClaimable(c)),
  destinations: ["/rewards", "/earn", "/assistant"],
  stages: [
    {
      id: "points",
      title: "FLOW Points accrued",
      body: "Off-chain points earned from verified activity. Campaign PTS is a separate ledger and never converts.",
      status: (c) => (hasFlowPoints(c) ? "COMPLETED" : "EXPLORE"),
    },
    {
      id: "requirements",
      title: "Conversion prerequisites",
      body: "Verified email, a bound wallet and community follows must all be met before any conversion is offered.",
      status: (c) => (c.rewardRequirementsMet ? "COMPLETED" : "NEEDS_YOU"),
    },
    {
      id: "convert",
      title: "Convert eligible points",
      body: "An explicit, user-confirmed off-chain conversion moves eligible points into claimable FLOW. It is not a wallet signature and never happens implicitly.",
      status: (c) => {
        if (hasClaimable(c) || (c.claimedFlow ?? 0) > 0) return "COMPLETED";
        if (!c.rewardStateReadable) return "VERIFYING";
        if (c.rewardNextStep === "CONVERT_FLOW_POINTS" && hasConvertible(c)) return "READY";
        return "EXPLORE";
      },
    },
    {
      id: "claim",
      title: "Claim FLOW on chain",
      body: "Claiming is a transaction your own wallet confirms on the rewards surface. FlowBridge never claims for you.",
      status: (c) => {
        if (!c.rewardStateReadable) return "VERIFYING";
        if (hasClaimable(c)) return "NEEDS_YOU";
        return (c.claimedFlow ?? 0) > 0 ? "COMPLETED" : "EXPLORE";
      },
    },
    {
      id: "wallet",
      title: "FLOW in your wallet",
      body: "Claimed FLOW is a live ERC-20 balance. From here it can be staked or held — your choice.",
      status: (c) => (hasIdleFlow(c) ? "COMPLETED" : "EXPLORE"),
    },
  ],
  primaryCta: () => ({ label: "Open rewards", href: "/rewards" }),
  secondaryCta: (c) =>
    hasIdleFlow(c) ? { label: "See staking", href: "/stake", tone: "ghost" } : { label: "Ask Flow AI", href: "/assistant", tone: "ghost" },
  completionEvidence:
    "Canonical reward state: an on-chain claim entitlement delta and the claimed FLOW total at the distributor.",
  relatedOpportunityKinds: ["CLAIM_FLOW", "CONVERT_FLOW_POINTS"],
  prompts: [
    "What happens next with my rewards?",
    "Why can't I claim yet?",
    "What's the difference between points and FLOW?",
  ],
};

/** START_STAKING — idle FLOW. Compare, then Build Mission only if chosen. */
const STAKING: JourneyDefinition = {
  journeyId: "START_STAKING",
  version: "v26.1",
  title: "Put idle FLOW to work",
  summary:
    "You hold FLOW that is doing nothing. Compare holding against staking before you decide anything.",
  displayPriority: 55,
  urgent: false,
  eligible: (c) => c.signedIn && c.activeMissionCount === 0 && hasIdleFlow(c),
  destinations: ["/stake", "/assistant", "/rewards"],
  stages: [
    {
      id: "understand",
      title: "Understand the vault",
      body: "Staking locks FLOW into the vault contract and accrues rewards per epoch. Principal withdrawal stays available.",
      status: () => "EXPLORE",
    },
    {
      id: "compare",
      title: "Compare your options",
      body: "Flow AI can preview liquid versus staked outcomes. Previews are estimates and are labelled as such — never a promise.",
      status: () => "EXPLORE",
    },
    {
      id: "decide",
      title: "Decide and prepare",
      body: "If you choose to stake, the staking surface prepares the transaction and your wallet confirms it.",
      status: (c) => (hasIdleFlow(c) ? "READY" : "EXPLORE"),
    },
  ],
  primaryCta: () => ({ label: "Open staking", href: "/stake" }),
  secondaryCta: () => ({ label: "Compare my options", href: "/assistant", tone: "ghost" }),
  completionEvidence:
    "A verified stake settlement in the vault, recorded as canonical activity.",
  relatedOpportunityKinds: ["STAKE_FLOW"],
  prompts: [
    "Compare my options",
    "What will my wallet confirm?",
    "What are the risks of staking?",
  ],
};

/** CONTINUE_MISSION — dominates everything; prevents duplicate workflows. */
const CONTINUE: JourneyDefinition = {
  journeyId: "CONTINUE_MISSION",
  version: "v26.1",
  title: "Finish what you started",
  summary:
    "You already have an active mission. Continuing it is better than starting a second one that does the same thing.",
  displayPriority: 100,
  urgent: true,
  eligible: (c) => c.signedIn && !!c.activeMission,
  destinations: ["/assistant", "/rewards", "/stake"],
  stages: [
    {
      id: "now",
      title: "Happening now",
      body: "The mission's current step, exactly as the server resolved it.",
      status: (c) => (c.missionNeedsWallet ? "NEEDS_YOU" : c.missionBlockerText ? "NEEDS_YOU" : "VERIFYING"),
    },
    {
      id: "next",
      title: "What comes next",
      body: "Each economic step is re-prepared and independently confirmed by your wallet. Nothing is batched or pre-authorized.",
      status: () => "EXPLORE",
    },
    {
      id: "settle",
      title: "Verified settlement",
      body: "Progress only advances from canonical verified outcomes — never from a click or from assistant wording.",
      status: () => "VERIFYING",
    },
  ],
  primaryCta: () => ({ label: "Continue mission", href: "/assistant" }),
  secondaryCta: () => null,
  completionEvidence:
    "Canonical verified activity linked to each mission step, with the mission's persisted completion record.",
  prompts: [
    "What does my mission still need from me?",
    "What happens next?",
    "Show what my wallet will confirm",
  ],
};

/** MISSION_OUTCOME — verified result, plus at most one follow-on suggestion. */
const OUTCOME: JourneyDefinition = {
  journeyId: "MISSION_OUTCOME",
  version: "v26.1",
  title: "Your last mission's result",
  summary:
    "A completed mission stays completed. Here is the verified outcome and one relevant thing you could do next.",
  displayPriority: 45,
  urgent: false,
  eligible: (c) => c.signedIn && c.activeMissionCount === 0 && c.completedMissionCount > 0,
  destinations: ["/assistant", "/activity", "/stake", "/rewards"],
  stages: [
    {
      id: "outcome",
      title: "Verified outcome",
      body: "The result was confirmed against canonical settlement data and is read-only from here on.",
      status: () => "COMPLETED",
    },
    {
      id: "next",
      title: "One optional next step",
      body: "A suggestion only. The completed workflow is never recreated for you.",
      status: (c) => (hasIdleFlow(c) || hasClaimable(c) ? "READY" : "EXPLORE"),
    },
  ],
  primaryCta: () => ({ label: "Review mission history", href: "/assistant" }),
  secondaryCta: (c) =>
    hasIdleFlow(c) ? { label: "See staking", href: "/stake", tone: "ghost" } : { label: "See activity", href: "/activity", tone: "ghost" },
  completionEvidence:
    "The mission's persisted completion record and the verified activity ids behind each step.",
  prompts: [
    "What did my last mission actually do?",
    "What should I do now?",
    "Why is this recommended?",
  ],
};

export const JOURNEY_REGISTRY: readonly JourneyDefinition[] = [
  CONTINUE,
  REWARDS,
  STAKING,
  OUTCOME,
  FIRST_ACTION,
  DISCOVER,
];

export function getJourneyDefinition(id: string): JourneyDefinition | null {
  return JOURNEY_REGISTRY.find((j) => j.journeyId === id) ?? null;
}

/** Order in which a stage status is treated as "still ahead of the user". */
export const OPEN_STAGE_STATUSES: readonly JourneyStageStatus[] = [
  "NEEDS_YOU",
  "READY",
  "VERIFYING",
  "EXPLORE",
];
