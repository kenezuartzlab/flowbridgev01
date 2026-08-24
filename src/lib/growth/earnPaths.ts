/**
 * FlowBridge V27 §6/§8/§10 — the "Ways to Earn" learning model (pure).
 *
 * Every earning path answers the same six questions: What is this? How can I
 * earn? What are the rules? What could change? What do I need to confirm? Why can
 * this help the BOT Chain ecosystem?
 *
 * Hard rules encoded here:
 *  - No "earn up to" number appears without a rule, a source and assumptions.
 *  - FLOW Points and Campaign PTS are documented as SEPARATE systems.
 *  - Nothing here is an offer, a quote or a guarantee; it is education only.
 */

export const EARN_PATHS_SCHEMA_VERSION = "flowbridge.earnpaths/1" as const;
export const EARN_PATHS_POLICY_VERSION = "V27" as const;

export const EARN_PATH_IDS = [
  "FLOW_POINTS",
  "FLOW_CLAIMS",
  "STAKING",
  "CAMPAIGNS",
  "PARTNERS",
] as const;
export type EarnPathId = (typeof EARN_PATH_IDS)[number];

/** Presentation state classes shared with the V25/V26 chips. */
export type EarnPathBadge = "VERIFIED" | "PREVIEW" | "EXTERNAL";

export interface EarnPath {
  id: EarnPathId;
  title: string;
  /** Plain-English one-liner used as the card summary. */
  summary: string;
  badge: EarnPathBadge;
  /** What is this? */
  what: string;
  /** How can I earn? */
  how: readonly string[];
  /** What are the rules? */
  rules: readonly string[];
  /** What could change? */
  couldChange: readonly string[];
  /** What do I need to confirm (wallet signature or explicit choice)? */
  confirm: string;
  /** V27 §8 — the truthful ecosystem link, or null when there isn't one. */
  whyBotChain: string | null;
  /** Where the user goes to actually do it. Navigation only. */
  href: string;
  ctaLabel: string;
  /** Product-friendly source name, never an internal table name. */
  source: string;
}

export const EARN_PATHS: readonly EarnPath[] = [
  {
    id: "FLOW_POINTS",
    title: "FLOW Points",
    summary: "Points recorded for verified FlowBridge activity. Not a token yet.",
    badge: "VERIFIED",
    what: "FLOW Points (PTS) are a score FlowBridge records when it verifies real product activity, such as a swap you confirmed in your wallet. Points are not FLOW tokens and are not in your wallet.",
    how: [
      "Confirm a supported swap or bridge in your wallet, then wait for FlowBridge to verify it on-chain.",
      "Points are only recorded after verification — opening a screen or tapping a card records nothing.",
    ],
    rules: [
      "One verified transaction is counted once. Repeats of the same transaction are ignored.",
      "There is a published daily limit on points from core swap activity.",
      "Campaign PTS are a separate scoreboard and never added to FLOW Points.",
    ],
    couldChange: [
      "Daily limits and which routes qualify can change as the product changes.",
      "Points already recorded stay recorded.",
    ],
    confirm:
      "Your wallet confirms the underlying swap or bridge. Recording points needs no extra signature.",
    whyBotChain:
      "The activity that earns points is a real transaction settled on BOT Chain, so the usage behind your points is genuine network usage.",
    href: "/trade",
    ctaLabel: "Trade & bridge",
    source: "Verified FlowBridge data",
  },
  {
    id: "FLOW_CLAIMS",
    title: "FLOW claims",
    summary: "How points become claimable FLOW, and when your wallet is needed.",
    badge: "VERIFIED",
    what: "FLOW is the token. Claiming is the step that moves FLOW you are entitled to into your wallet.",
    how: [
      "Have eligible FLOW Points above the published conversion minimum.",
      "Convert those points, then claim the resulting FLOW with a wallet confirmation.",
    ],
    rules: [
      "A wallet must be bound to your account before anything can be claimed.",
      "Only eligible points convert. Campaign PTS never convert.",
      "Conversion rules are approved per network. Where no approved rule exists, claiming stays closed.",
    ],
    couldChange: [
      "Which networks have an approved conversion rule can change.",
      "A claim authorization is short-lived and must be used before it expires.",
    ],
    confirm: "Yes — you sign the claim in your wallet. FlowBridge never signs for you.",
    whyBotChain:
      "A claim is an on-chain transfer from a pre-funded distributor contract, so it is verifiable on the BOT Chain explorer.",
    href: "/rewards",
    ctaLabel: "Open rewards",
    source: "Verified FlowBridge data",
  },
  {
    id: "STAKING",
    title: "Staking FLOW",
    summary: "Lock FLOW in the published vault and share the funded reward schedule.",
    badge: "VERIFIED",
    what: "Staking means locking FLOW you already hold into a published vault contract. The vault pays rewards out of a separately funded reward budget — it never creates new FLOW.",
    how: [
      "Hold FLOW in your wallet on the supported network.",
      "Approve the exact amount, then stake it. Both steps are your own wallet confirmations.",
      "Claim staking rewards or withdraw your principal whenever you choose.",
    ],
    rules: [
      "There is a published minimum first stake, read live from the vault.",
      "Rewards are shared across everyone staked: your share depends on your amount versus the total staked.",
      "The reward rate comes from the funded schedule on-chain — FlowBridge does not set or promise a rate.",
    ],
    couldChange: [
      "The total staked changes constantly, so your share and any estimate change with it.",
      "The reward schedule can end or be re-funded, and the operator can pause staking.",
    ],
    confirm: "Yes — approve and stake are two separate wallet confirmations you make yourself.",
    whyBotChain:
      "Staking keeps FLOW committed to a published BOT Chain contract and the reward schedule is paid from real on-chain inventory, which is visible to anyone.",
    href: "/stake",
    ctaLabel: "Open staking",
    source: "Live on-chain vault state",
  },
  {
    id: "CAMPAIGNS",
    title: "Campaigns",
    summary: "Time-boxed activity with its own Campaign PTS scoreboard.",
    badge: "VERIFIED",
    what: "Campaigns are published activities with their own tasks and their own score, called Campaign PTS.",
    how: [
      "Open a campaign, read the task rules, then complete a qualifying action.",
      "Qualification is checked against verified activity, not against taps.",
    ],
    rules: [
      "Only the actions the campaign names qualify.",
      "Campaign PTS are a separate system: they are not FLOW Points and never convert into FLOW.",
      "Campaign rewards, if any, are described by that campaign.",
    ],
    couldChange: ["Campaigns start and end. Tasks and rewards are set by the campaign owner."],
    confirm:
      "If a task involves a transaction, your wallet confirms that transaction as usual.",
    whyBotChain:
      "Campaigns introduce real users to BOT Chain ecosystem projects and the qualifying actions are verified on-chain activity.",
    href: "/campaigns",
    ctaLabel: "Explore campaigns",
    source: "Published campaign rules",
  },
  {
    id: "PARTNERS",
    title: "Partner & ecosystem opportunities",
    summary: "Verified partner products worth discovering. Terms belong to the partner.",
    badge: "EXTERNAL",
    what: "Partners are other BOT Chain products FlowBridge can point you to.",
    how: [
      "Browse the partner directory and open a partner you are interested in.",
      "Anything you do there follows that partner's own rules and confirmations.",
    ],
    rules: [
      "Only currently available, verified partners are listed.",
      "FlowBridge does not hold, guarantee or price a partner's rewards.",
    ],
    couldChange: ["Partner availability and partner terms change independently of FlowBridge."],
    confirm: "Anything financial happens in the partner's own product, with its own confirmation.",
    whyBotChain:
      "Sending real users to useful ecosystem products is direct, measurable ecosystem participation.",
    href: "/partners",
    ctaLabel: "See partners",
    source: "External partner information",
  },
];

export function earnPath(id: EarnPathId): EarnPath {
  return EARN_PATHS.find((p) => p.id === id) ?? EARN_PATHS[0]!;
}

/**
 * V27 §7 — the reward stage ladder, in the exact canonical order. Presentation
 * of the V17.1B stages; this module never computes a stage value.
 */
export const REWARD_STAGES = [
  {
    id: "FLOW_POINTS",
    label: "FLOW Points",
    body: "Recorded for verified activity. A score, not a token.",
  },
  {
    id: "READY_TO_CONVERT",
    label: "Ready to convert",
    body: "Eligible points above the published minimum.",
  },
  {
    id: "CLAIMABLE_FLOW",
    label: "Claimable FLOW",
    body: "FLOW you are entitled to, not yet in your wallet.",
  },
  {
    id: "CLAIMED_FLOW",
    label: "Claimed FLOW",
    body: "FLOW already delivered on-chain to you.",
  },
  {
    id: "WALLET_FLOW",
    label: "Wallet FLOW",
    body: "The live FLOW balance your wallet holds right now.",
  },
] as const;

export type RewardStageId = (typeof REWARD_STAGES)[number]["id"];

/** Constants a test can assert: the learning centre is economically inert. */
export const EARN_PATHS_AUTHORITY = {
  createsMission: false,
  createsActionIntent: false,
  signsTransaction: false,
  guaranteesEarnings: false,
} as const;
