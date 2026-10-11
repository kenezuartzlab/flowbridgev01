// PRIVATE: BOT Ecosystem Support application profile. Consumed only by the
// admin-gated application workspace (/sets?section=application). Never import
// from public routes, nav, sitemap or SEO metadata.

export const OWNER_INPUT = "OWNER INPUT REQUIRED" as const;

export const AWARD_CREDENTIAL = "1st Place - EVM Deployment Track, BOT Chain Builder Challenge #1";

/** Owner-approved application position; no pre-onboarding qualification calculation. */
export const APPLICATION_STATUS = {
  application: "READY TO SUBMIT",
  requestedSupport: "OPTION A - DEX LIQUIDITY SUPPORT",
  program: "NOT YET APPROVED / MONITORING NOT YET STARTED",
  qualification: "PENDING PROGRAM ONBOARDING",
  monitoringWindow: "TO BE CONFIRMED BY BOT CHAIN AFTER APPROVAL",
  activity: "SUPPORTING PROOF OF MAINNET READINESS AND GENUINE ECOSYSTEM PARTICIPATION",
} as const;

export const SUPPORT_POSITION = "FlowBridge is applying for Option A - DEX Liquidity Support. We are submitting the project's production deployment, technical architecture, verified contracts, on-chain evidence, ecosystem contribution and mainnet readiness for BOT Chain's evaluation. Any support level, incentive allocation, rebate, points or other program benefit will be determined by BOT Chain according to its current program rules and review process.";

export const COMPLIANCE_ACTION = { actor: "OWNER", accepted: false, submitted: false } as const;

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

// Public-safe contract identity is separate from private application answers.
export { PRODUCTION_CONTRACTS as CONTRACT_REGISTRY } from "../contracts/productionRegistry";

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
  "FlowBridge is a mainnet-live, non-custodial Web3 application built to make the BOT Chain ecosystem easier to use and grow. It combines trading, bridging, MultiSend, staking, verified rewards, ecosystem discovery and guided wallet interactions in one platform. FlowBridge integrates BDEX V3 and live FLOW/USDT trading on BOT Mainnet, with transparent route information, price-impact protection and explicit wallet confirmation for economic actions. FlowBridge was awarded 1st Place - EVM Deployment Track, BOT Chain Builder Challenge #1. Our goal is to deepen real BOT Chain utility, sustainable liquidity, genuine user participation and verifiable on-chain activity.";

/** Copy-ready answers in stored form order; current sign-in-only form requires owner confirmation. */
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
    { id: "stage", label: "Current Development Stage", value: "MAINNET LIVE", status: "ready" },
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
      value: SUPPORT_POSITION,
      status: "ready",
    },
    { id: "contactName", label: "Contact Name / Alias", value: "Kenezu", status: "ready" },
    { id: "contactMethod", label: "Preferred Contact Method", value: "Telegram: @crypticmaster\nEmail: flowbridgeweb3@gmail.com", status: "ready" },
    { id: "bd", label: "Name the BD you contact with, if you have one", value: "N/A - no assigned BOT Chain BD contact yet", status: "ready" },
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
