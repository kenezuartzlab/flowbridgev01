// PRIVATE: BOT Ecosystem Support application profile. Consumed only by the
// admin-gated application workspace (/sets?section=application). Never import
// from public routes, nav, sitemap or SEO metadata.

export const OWNER_INPUT = "OWNER INPUT REQUIRED" as const;

export const AWARD_CREDENTIAL = "1st Place — EVM Deployment Track, BOT Chain Builder Challenge #1";

/** Dated snapshot of BOT Chain's published Scheme A rules. Never a product constant:
 *  if the official page changes, add a new snapshot and keep this one for audit. */
export const SCHEME_A_RULES = {
  version: "botchain-ecosystem-support/scheme-a@2026-09-29",
  checkedAt: "2026-09-29",
  source: "https://www.botchain.ai/en/ecosystem-support",
  pairRule: "Project token/stablecoin or project token/BOT on BOT Chain mainnet",
  countingRules: [
    "Only the first transaction from a single address per trading pair in a 24-hour period is counted.",
    "No single address may exceed 40% of daily trading volume.",
    "Liquidity must stay at or above the tier minimum for 7 consecutive days.",
    "Trading volume must be reached organically within a 15-day window.",
  ],
  tiers: [
    { tier: 1, minLpUsd: 50_000, volume15dUsd: 125_000, txCount: 1_250, baseRewardUsd: 1_250, maxRewardUsd: 4_000 },
    { tier: 2, minLpUsd: 200_000, volume15dUsd: 500_000, txCount: 5_000, baseRewardUsd: 5_000, maxRewardUsd: 16_000 },
    { tier: 3, minLpUsd: 1_000_000, volume15dUsd: 2_000_000, txCount: 15_000, baseRewardUsd: 8_000, maxRewardUsd: 40_000 },
    { tier: 4, minLpUsd: 5_000_000, volume15dUsd: 8_000_000, txCount: 50_000, baseRewardUsd: 15_000, maxRewardUsd: 160_000 },
    { tier: 5, minLpUsd: 10_000_000, volume15dUsd: 20_000_000, txCount: 100_000, baseRewardUsd: 20_000, maxRewardUsd: 240_000 },
  ],
  portalDifference:
    "The uploaded application portal states 'up to $350,000 per project' while the public page states 'maximum funding per project: $1 million'. Final submission must follow the live portal terms.",
} as const;

export const ANTI_CHEATING_NOTICE = {
  title: "BOT Chain Anti-Cheating Compliance Notice",
  points: [
    "All submitted wallets, users, transactions, TVL, liquidity, volume and interaction counts must be true and unmanipulated.",
    "BOT Chain may run address de-duplication, trading-pattern analysis, contract audits and fund-flow tracing; full cooperation is required.",
    "Prohibited: self-trading, circular transfers, scripted interactions, Sybil wallets, flash-loan TVL and gas farming.",
    "Violations: disqualification, reclaim of all rewards, public disclosure, permanent blacklist, legal action.",
    "BOT Chain may audit historical data for 12 months after any reward distribution.",
  ],
  flowbridgeRule:
    "FlowBridge never creates interactions to improve program statistics. Every metric here is read from canonical BOT Mainnet records.",
};

export interface ContractEntry {
  name: string;
  chainId: number;
  address: `0x${string}`;
  state: string;
}

export const CONTRACT_REGISTRY: ContractEntry[] = [
  { name: "FLOW Token", chainId: 677, address: "0xcaaB50F36252a57529AFeF651fa6B9f9281917fF", state: "LIVE" },
  { name: "FlowBridge Router v3 (live execution router)", chainId: 677, address: "0x19784e19546307af427902a75771434df831d882", state: "LIVE" },
  { name: "Rewards Distributor", chainId: 677, address: "0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922", state: "LIVE / funded" },
  { name: "Activity Registry", chainId: 677, address: "0x86590b7C8A2Ad9a1dAD8183Eaf627AE4B7Ff3814", state: "DEPLOYED / no new attestations authorized" },
  { name: "Staking Reward Treasury", chainId: 677, address: "0x965529099998F3DbAf5Ff4979dc158508b3442e65", state: "LIVE / funded" },
  { name: "Staking Controller", chainId: 677, address: "0x44b9b880C6188D8b8dbe4f68216aE28a5A1253bF", state: "LIVE" },
  { name: "Staking Vault V2", chainId: 677, address: "0x15e7B1b4b16a43E6CE2E1f460dBE4201E9B6790D", state: "LIVE" },
  { name: "MultiSend V1 (BOT Mainnet)", chainId: 677, address: "0xc54CAcfd96330949db0eAEd72dE930a2d06d9778", state: "LIVE / verified" },
  { name: "MultiSend V1 (BNB Mainnet)", chainId: 56, address: "0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e", state: "LIVE / verified" },
  { name: "BDEX V3 FLOW/USDT pool (1% fee)", chainId: 677, address: "0xDaCFc2574b6110892351Bd31afb36F95E7206162", state: "LIVE" },
];

export const CORE_HIGHLIGHTS: string[] = [
  "Live on BOT Chain Mainnet (chain 677) at flowbridge.space.",
  "One guided product for BOT Chain utility: Trade, Bridge, MultiSend, Staking and verified Rewards.",
  "Integrates BDEX V3 liquidity, including the canonical FLOW/USDT 1% pool, with live quotes, price-impact display and price-protection controls.",
  "Non-custodial: every approval, swap, stake, claim, bridge and MultiSend is an explicit user wallet signature; connecting a wallet never approves anything.",
  "Records genuine on-chain participation only — no manufactured activity.",
  AWARD_CREDENTIAL + ".",
];

export type FieldStatus = "ready" | "owner" | "private";
export interface ApplicationField {
  id: string;
  label: string;
  value: string;
  status: FieldStatus;
  note?: string;
}

export function applicationFields(opts: { whitepaperUrl: string }): ApplicationField[] {
  return [
    { id: "name", label: "Project Name", value: "FlowBridge", status: "ready" },
    { id: "highlights", label: "Core Highlights", value: CORE_HIGHLIGHTS.map((h) => `• ${h}`).join("\n"), status: "ready" },
    { id: "website", label: "Official Website", value: "https://flowbridge.space", status: "ready" },
    { id: "x", label: "Twitter (X)", value: "https://x.com/flowbridgeweb3", status: "ready" },
    { id: "community", label: "Telegram / Discord", value: OWNER_INPUT, status: "owner", note: "Official community link not yet supplied." },
    { id: "stage", label: "Current Development Stage", value: "Mainnet Live", status: "ready" },
    { id: "whitepaper", label: "Whitepaper", value: opts.whitepaperUrl, status: "ready" },
    { id: "deck", label: "Pitch Deck", value: "Private signed link — generate below", status: "private" },
    { id: "github", label: "GitHub Repository / reviewer access", value: OWNER_INPUT, status: "owner", note: "Repository URL or reviewer GitHub ID and permissions." },
    { id: "demo", label: "Demo / Live App Link", value: "https://flowbridge.space", status: "ready" },
    { id: "wallet", label: "Primary Receiving Wallet", value: OWNER_INPUT, status: "owner", note: "Sole wallet for gas rebates and incentives. Never guessed." },
    { id: "assoc", label: "Backup / Associated Wallets", value: OWNER_INPUT, status: "owner", note: "Project-related wallets the owner confirms." },
    { id: "evidence", label: "On-chain Interaction Records", value: "Explorer evidence export (below)", status: "private" },
    { id: "scheme", label: "Support Tier (A / B / C)", value: OWNER_INPUT, status: "owner", note: "Preparation targets Scheme A; final choice is the owner's." },
    { id: "contactName", label: "Contact Name / Alias", value: OWNER_INPUT, status: "owner" },
    { id: "contactMethod", label: "Preferred Contact Method", value: OWNER_INPUT, status: "owner", note: "Platform + account (Telegram / WeChat / Email)." },
  ];
}
