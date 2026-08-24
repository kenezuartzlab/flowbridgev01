/**
 * FlowBridge V28 §6/§7/§8 — the BOT Chain ecosystem discovery model (pure).
 *
 * Every discovery item is built from something that is REALLY available: a
 * canonical opportunity from the frozen decision result, an existing FlowBridge
 * product surface, or an existing learning path. There are no invented APYs, no
 * fake reward pools, no fake participation counts, no countdowns and no
 * "trending" claims — because none of those exist as verified inputs.
 */
import type { DecisionResult } from "@/lib/ai/decision/decisionTypes";
import { EARN_PATHS } from "./earnPaths";
import { botChainImpact, impactTopicForDomain } from "./botChainImpact";

export const DISCOVERY_SCHEMA_VERSION = "flowbridge.discovery/1" as const;
export const DISCOVERY_POLICY_VERSION = "V28" as const;

/** Plain-language labels (V28 §6/§8). */
export type DiscoveryLabel = "VERIFIED" | "EXTERNAL" | "PREVIEW";

export const DISCOVERY_LABEL_MEANING: Record<DiscoveryLabel, string> = {
  VERIFIED: "FlowBridge has verified data for this.",
  EXTERNAL: "Runs outside FlowBridge — check it yourself before using it.",
  PREVIEW: "An estimate or explanation, not a confirmed outcome.",
};

export type DiscoveryGroup = "PRODUCT" | "CAMPAIGNS" | "STAKING" | "LEARN";

export interface DiscoveryItem {
  id: string;
  group: DiscoveryGroup;
  title: string;
  label: DiscoveryLabel;
  /** What is it? */
  what: string;
  /** Why might I care? */
  whyCare: string;
  /** What can I learn or earn? */
  learnOrEarn: string;
  /** What are the rules? */
  rules: string;
  /** How does this support BOT Chain? */
  whyBotChain: string;
  /** What happens next? */
  whatNext: string;
  href: string;
  ctaLabel: string;
  /** True when a wallet confirmation is part of doing this. */
  requiresWalletConfirmation: boolean;
}

export interface DiscoveryInput {
  decision: DecisionResult | null;
  signedIn: boolean;
}

export interface DiscoveryView {
  schemaVersion: typeof DISCOVERY_SCHEMA_VERSION;
  policyVersion: typeof DISCOVERY_POLICY_VERSION;
  featured: readonly DiscoveryItem[];
  items: readonly DiscoveryItem[];
  /** Honest copy when personalized availability could not be read. */
  notice: string | null;
  createsMission: false;
  createsActionIntent: false;
}

/** Always-true FlowBridge product surfaces. Facts only, no numbers. */
const PRODUCT_ITEMS: readonly DiscoveryItem[] = [
  {
    id: "product:trade",
    group: "PRODUCT",
    title: "Swap on BOT Chain",
    label: "VERIFIED",
    what: "Trade supported BOT Chain tokens inside FlowBridge, with the route and fee shown before you confirm.",
    whyCare: "It is the simplest real thing to do on BOT Chain, and prices are readable before you sign in.",
    learnOrEarn:
      "Verified swaps are what FlowBridge records FLOW Points for, under the published daily limit.",
    rules: "You confirm every swap in your own wallet. Points are only recorded after on-chain verification.",
    whyBotChain: botChainImpact("SWAP"),
    whatNext: "You open the trade screen, review the route, and decide whether to confirm.",
    href: "/",
    ctaLabel: "Open trading",
    requiresWalletConfirmation: true,
  },
  {
    id: "product:bridge",
    group: "PRODUCT",
    title: "Bridge USDT between BOT and BNB",
    label: "VERIFIED",
    what: "Move USDT across the supported bridge route and track it until it arrives.",
    whyCare: "Bringing assets to BOT Chain is what makes the rest of the ecosystem usable for you.",
    learnOrEarn: "You learn how the route, fees and settlement tracking actually work.",
    rules:
      "Bridging is submitted from your wallet. A submitted transaction is not a settled transfer until the destination confirms.",
    whyBotChain: botChainImpact("BRIDGE"),
    whatNext: "You review the destination and amount, then decide whether to confirm.",
    href: "/",
    ctaLabel: "Open bridge",
    requiresWalletConfirmation: true,
  },
  {
    id: "product:markets",
    group: "PRODUCT",
    title: "BOT Chain market prices",
    label: "VERIFIED",
    what: "Live prices for supported BOT Chain tokens, read from public market data.",
    whyCare: "Look before you trade. Nothing here asks you to sign anything.",
    learnOrEarn: "You learn how BOT Chain pairs are actually moving right now.",
    rules: "Prices are informational and change constantly. They are not a quote.",
    whyBotChain:
      "Readable prices help people use BOT Chain products with real information instead of guesswork.",
    whatNext: "You browse prices and decide what, if anything, to do next.",
    href: "/markets",
    ctaLabel: "See markets",
    requiresWalletConfirmation: false,
  },
  {
    id: "staking:flow",
    group: "STAKING",
    title: "Stake FLOW",
    label: "VERIFIED",
    what: "Lock FLOW you already hold into the FlowBridge staking vault, with the current rate read live from the contract.",
    whyCare: "If you already hold FLOW, staking is the supported way to put it to work.",
    learnOrEarn:
      "The learning centre includes a live preview calculator so you can see an estimate before deciding.",
    rules:
      "Estimates are previews, never promises. Every stake, unstake and claim is a separate wallet confirmation.",
    whyBotChain: botChainImpact("STAKING"),
    whatNext: "You open staking, review the live numbers, and decide whether to confirm.",
    href: "/stake",
    ctaLabel: "Open staking",
    requiresWalletConfirmation: true,
  },
];

/** Learning items derived from the existing V27 earn paths. */
const LEARN_ITEMS: readonly DiscoveryItem[] = EARN_PATHS.map((p) => ({
  id: `learn:${p.id}`,
  group: "LEARN" as const,
  title: `Learn: ${p.title}`,
  label: (p.badge === "EXTERNAL" ? "EXTERNAL" : p.badge === "PREVIEW" ? "PREVIEW" : "VERIFIED") as DiscoveryLabel,
  what: p.what,
  whyCare: p.summary,
  learnOrEarn: p.how[0] ?? "Read how this works before deciding anything.",
  rules: p.rules[0] ?? "Current FlowBridge rules apply in full.",
  whyBotChain:
    p.whyBotChain ??
    "This one is about understanding FlowBridge itself, so no ecosystem impact is claimed.",
  whatNext: "You read the explanation. Nothing is signed or submitted.",
  href: "/learn",
  ctaLabel: "Read the guide",
  requiresWalletConfirmation: false,
}));

/** Maps a canonical decision item into a discovery item, verbatim. */
function fromDecision(item: DecisionResult["items"][number]): DiscoveryItem {
  const topic = impactTopicForDomain(item.domain);
  return {
    id: `live:${item.id}`,
    group: item.domain === "CAMPAIGNS" ? "CAMPAIGNS" : item.domain === "STAKING" ? "STAKING" : "PRODUCT",
    title: item.title,
    label: "VERIFIED",
    what: item.what,
    whyCare: item.whyNow,
    learnOrEarn: item.whatNext,
    rules: item.blocked && item.blockerText
      ? `Currently blocked: ${item.blockerText}`
      : item.requiresWalletConfirmation
        ? "You confirm this in your own wallet. FlowBridge never signs for you."
        : "No wallet confirmation is involved in looking at this.",
    whyBotChain: topic
      ? botChainImpact(topic)
      : "This is a FlowBridge account step, so no wider ecosystem impact is claimed.",
    whatNext: item.whatNext,
    href: item.surface.href,
    ctaLabel: item.surface.label,
    requiresWalletConfirmation: item.requiresWalletConfirmation,
  };
}

export function buildDiscovery(input: DiscoveryInput): DiscoveryView {
  const live = (input.decision?.items ?? []).map(fromDecision);

  const seen = new Set<string>();
  const items = [...live, ...PRODUCT_ITEMS, ...LEARN_ITEMS].filter((i) =>
    seen.has(i.id) ? false : (seen.add(i.id), true),
  );

  const notice = !input.signedIn
    ? "Sign in to also see opportunities that depend on your own account state. Everything below is available to browse now."
    : input.decision?.status === "DEGRADED"
      ? "Some personalized availability could not be read just now, so only confirmed items are shown."
      : null;

  return {
    schemaVersion: DISCOVERY_SCHEMA_VERSION,
    policyVersion: DISCOVERY_POLICY_VERSION,
    featured: items.slice(0, 3),
    items,
    notice,
    createsMission: false,
    createsActionIntent: false,
  };
}

export const DISCOVERY_AUTHORITY = {
  createsMission: false,
  createsActionIntent: false,
  signsTransaction: false,
  fabricatesYield: false,
} as const;
