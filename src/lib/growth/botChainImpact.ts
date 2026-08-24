/**
 * FlowBridge V28 §7 — "Why this helps BOT Chain", in plain English.
 *
 * Each entry states a CONCRETE mechanism. We never claim that any action
 * automatically grows the whole ecosystem, and we never attach an impact claim
 * to something that does not actually touch BOT Chain or a BOT ecosystem product.
 */

export const BOT_IMPACT_TOPICS = [
  "SWAP",
  "BRIDGE",
  "STAKING",
  "CAMPAIGNS",
  "DISCOVERY",
  "ACCOUNT",
] as const;
export type BotImpactTopic = (typeof BOT_IMPACT_TOPICS)[number];

export const BOT_CHAIN_IMPACT: Record<BotImpactTopic, string> = {
  SWAP: "Swaps routed on BOT Chain are real on-chain usage: they pay BOT Chain gas and add real trading volume to BOT Chain liquidity pools.",
  BRIDGE:
    "Bridging moves real value onto BOT Chain, so BOT Chain applications have more assets available to work with.",
  STAKING:
    "Staking FLOW is a visible, voluntary commitment: it reduces circulating supply held idle and shows real participation in a BOT Chain project.",
  CAMPAIGNS:
    "Verified campaign participation gives BOT Chain projects real users and measurable activity instead of empty impressions.",
  DISCOVERY:
    "Trying a real BOT Chain product gives that project actual users, and the ecosystem measurable activity rather than marketing claims.",
  ACCOUNT:
    "A verified account lets FlowBridge count your activity once, to the right wallet, so ecosystem reporting reflects real people rather than duplicates.",
};

export function botChainImpact(topic: BotImpactTopic): string {
  return BOT_CHAIN_IMPACT[topic];
}

/** Maps a canonical opportunity domain to its truthful impact topic, if any. */
export function impactTopicForDomain(domain: string | null | undefined): BotImpactTopic | null {
  switch (domain) {
    case "SWAP":
      return "SWAP";
    case "BRIDGE":
      return "BRIDGE";
    case "STAKING":
      return "STAKING";
    case "CAMPAIGNS":
      return "CAMPAIGNS";
    default:
      return null;
  }
}
