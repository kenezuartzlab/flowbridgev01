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
  { name: "FlowBridge Router v3 (live execution router)", chainId: 677, address: "0x986962de6f00d0ec571b1a34fa70aeeb445b5445", state: "LIVE" },
  { name: "Rewards Distributor", chainId: 677, address: "0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922", state: "LIVE / funded" },
  { name: "Activity Registry", chainId: 677, address: "0x86590b7C8A2Ad9a1dAD8183Eaf627AE4B7Ff3814", state: "DEPLOYED / no new attestations authorized" },
  { name: "Staking Reward Treasury", chainId: 677, address: "0x96552909998F3DbAf5Ff4979dc158508b3442e65", state: "LIVE / funded" },
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

export const CORE_HIGHLIGHTS_ANSWER =
  "FlowBridge is a mainnet-live, non-custodial Web3 application built to make the BOT Chain ecosystem easier to use and grow. It combines trading, bridging, MultiSend, staking, verified rewards, ecosystem discovery and guided wallet interactions in one platform. FlowBridge integrates BDEX V3 and live FLOW/USDT trading on BOT Mainnet, with transparent route information, price-impact protection and explicit wallet confirmation for economic actions. FlowBridge was awarded 1st Place — EVM Deployment Track, BOT Chain Builder Challenge #1. Our goal is to deepen real BOT Chain utility, sustainable liquidity, genuine user participation and verifiable on-chain activity.";

export const PORTAL_FUNDING_REFERENCE =
  "Up to $350,000 equivalent/project (application portal), plus Gas rebates up to 35% and community points for approved projects.";

/** Final copy-ready answers, in the updated Google Form order. */
export function applicationFields(_opts: { whitepaperUrl: string }): ApplicationField[] {
  return [
    { id: "email", label: "Email", value: "flowbridgeweb3@gmail.com", status: "ready" },
    { id: "name", label: "Project Name", value: "FlowBridge", status: "ready" },
    { id: "highlights", label: "Core Highlights", value: CORE_HIGHLIGHTS_ANSWER, status: "ready" },
    {
      id: "channels",
      label: "Official Channels",
      value: "Project Website: https://flowbridge.space\nTwitter (X): https://x.com/flowbridgeweb3\nTelegram: https://t.me/flowbridgeweb",
      status: "ready",
    },
    { id: "stage", label: "Current Development Stage", value: "Mainnet Live", status: "ready" },
    {
      id: "deck",
      label: "Whitepaper / Pitch Deck",
      value: "FlowBridge BOT Ecosystem Support Pitch Deck + Whitepaper — private reviewer package:\n[INSERT FRESH PRIVATE REVIEWER LINK]",
      status: "private",
      note: "Use Refresh links below, then paste the fresh signed link.",
    },
    { id: "github", label: "GitHub Repository URL", value: "https://github.com/kenezuartzlab/flowbridgev01", status: "ready" },
    {
      id: "demo",
      label: "Demo Video / Testnet Link",
      value: "Live Mainnet DApp: https://flowbridge.space\nFlowBridge is already live on BOT Mainnet; the production application serves as the primary interactive demo.",
      status: "ready",
    },
    {
      id: "wallet",
      label: "Primary Receiving Wallet Address",
      value: "0x62b1902F23483e0AF44564681865E993AAA47368",
      status: "ready",
      note: "Sole wallet for Gas rebates, points and incentives — verify once more before submitting.",
    },
    { id: "assoc", label: "Backup / Associated Wallet Address", value: "0x8b3Ab1c5c5ff9a29B0008b5d8B9E5559a181b228", status: "ready" },
    {
      id: "evidence",
      label: "On-chain Interaction Records",
      value: "BOT Mainnet deployment and usage evidence covering canonical FlowBridge contracts, FLOW/USDT BDEX V3 liquidity and trading, staking, rewards, MultiSend and verified production interactions.",
      status: "private",
      note: "Upload the latest On-chain Evidence Pack export from this section.",
    },
    {
      id: "scheme",
      label: "Support Tier",
      value: "Option A — DEX Liquidity Support\n\nFlowBridge selects Option A because FLOW/USDT liquidity and trading are already live on BOT Mainnet through BDEX V3 and integrated directly into the FlowBridge trading experience. We intend to grow sustainable liquidity depth, organic trading activity and real BOT Chain participation while maintaining transparent, auditable on-chain metrics.",
      status: "ready",
    },
    { id: "contactName", label: "Contact Name / Alias", value: "Kenezu", status: "ready" },
    { id: "contactMethod", label: "Preferred Contact Method", value: "Telegram: @crypticmaster\nEmail: flowbridgeweb3@gmail.com", status: "ready" },
    { id: "bd", label: "Name the BD you contact with, if you have one", value: "N/A — no assigned BOT Chain BD contact yet", status: "ready" },
    {
      id: "compliance",
      label: "Compliance confirmation",
      value:
        "I have fully read and understood the BOTChain Ecosystem Support Program Anti-Cheating Compliance Notice.\nI confirm that FlowBridge will not engage in cheating, wash trading, Sybil activity, artificial liquidity/volume inflation or data manipulation.\nI accept BOTChain's risk-control and audit mechanisms.",
      status: "owner",
      note: "Owner must personally agree to these terms before ticking them in the form.",
    },
  ];
}
