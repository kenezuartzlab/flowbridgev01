/** Read-only evidence, NOT a swap allowlist or execution authorization. */
export const REVIEWED_AT = "2026-11-17T05:35:20Z";
export const BNB_CHAIN_ID = 56;
export const RWA_TRADING_ENABLED = false;
export type Category = "metals" | "stocks" | "etfs";
export const SOURCES = {
  tetherProtocols: "https://tether.to/en/supported-protocols/",
  tetherLaunch: "https://tether.io/news/tether-gold-the-worlds-leading-tokenized-gold-product-to-be-listed-on-bnb-chain/",
  tetherLegal: "https://gold.tether.to/legal",
  matrixdock: "https://www.matrixdock.com/xaum",
  matrixdockBnb: "https://www.matrixdock.com/blog/announcements/matrixdock-adopts-chainlink-smartdata-to-power-xaum-on-bnb-chain",
  ondo: "https://ondo.finance/blog/global-markets-live-on-bnb-chain",
  ondoEligibility: "https://docs.ondo.finance/ondo-global-markets/eligibility",
  xstocks: "https://xstocks.fi/news/xstocks-launches-on-bnb-chain",
  bstocks: "https://www.bnbchain.org/en/blog/introducing-bstocks-on-bnb-chain-trade-24-7-with-zero-fees-deploy-across-defi-protocols-with-full-self-custody",
  pancake: "https://docs.pancakeswap.finance/trade/pancakeswap-x/rwas",
  pancakeFaq: "https://docs.pancakeswap.finance/trade/pancakeswap-x/faqs",
  pancakeBstocks: "https://blog.pancakeswap.finance/articles/bstocks-on-pancakeswap",
  xautDex: "https://dexscreener.com/bsc/0x83A0A8A723262651Ae9C54BBbA929F167443bC59",
  metamask: "https://support.metamask.io/trade/real-world-assets/",
} as const;
export type SourceId = keyof typeof SOURCES;
export interface RwaEntry {
  id: string; name: string; symbol?: string; chainId: 56;
  categories: readonly Category[]; issuer: string;
  kind: "allocated-metal-token" | "securities-catalog";
  legalProductType: string; backing: string;
  eligibilityMode: "issuer-terms" | "provider-verification-required";
  marketHours: string; rights: "issuer-defined-no-guarantee";
  identity: "issuer-contract-confirmed" | "contract-pending" | "catalog-only";
  contract?: `0x${string}`; docs: SourceId;
  evidence: readonly { source: SourceId; claim: string; reviewedAt: string }[];
  dexListing?: { provider: "PancakeSwap V3"; mode: "amm-v3"; pair: `0x${string}`; quoteSymbol: "USDT"; quoteContract: `0x${string}`; source: SourceId; reviewedAt: string };
}
const evidence = (source: SourceId, claim: string) => ({ source, claim, reviewedAt: REVIEWED_AT });
const securityHours = "Provider market windows and quote availability apply. On-chain transferability does not mean executable quotes at market close.";
export const RWA_REGISTRY: readonly RwaEntry[] = [
  { id: "xaut-bnb", name: "Tether Gold", symbol: "XAUt", chainId: 56, categories: ["metals"], issuer: "TG Commodities, S.A. de C.V.", kind: "allocated-metal-token", legalProductType: "Allocated physical-gold token under issuer terms", backing: "Issuer states one token represents one fine troy ounce of allocated gold on a London Good Delivery bar held in Swiss vaults. Custody, redemption and issuer terms apply.", eligibilityMode: "issuer-terms", marketHours: "Existing XAUt / USDT AMM listing observed. Current executable quotes, pool health and FlowBridge access are not verified; issuer redemption is outside FlowBridge's scope.", rights: "issuer-defined-no-guarantee", identity: "issuer-contract-confirmed", contract: "0x21cAef8A43163Eea865baeE23b9C2E327696A3bf", docs: "tetherLegal", dexListing: { provider: "PancakeSwap V3", mode: "amm-v3", pair: "0x83A0A8A723262651Ae9C54BBbA929F167443bC59", quoteSymbol: "USDT", quoteContract: "0x55d398326f99059fF775485246999027B3197955", source: "xautDex", reviewedAt: REVIEWED_AT }, evidence: [evidence("tetherProtocols", "BNB BEP20 contract identity"), evidence("tetherLaunch", "BNB launch, 26 March 2026; issuer and one fine troy ounce backing"), evidence("xautDex", "Third-party XAUt / USDT PancakeSwap V3 pair listing; not a live executable quote or pool audit")] },
  { id: "xaum-research", name: "Matrixdock Gold", symbol: "XAUm", chainId: 56, categories: ["metals"], issuer: "Matrixdock — legal issuing entity review pending", kind: "allocated-metal-token", legalProductType: "Physical-gold token; legal terms review pending", backing: "Matrixdock describes physical gold backing and BNB presence. Exact BNB contract, custody and redemption terms require direct verification.", eligibilityMode: "issuer-terms", marketHours: "Trading integration and liquidity unverified.", rights: "issuer-defined-no-guarantee", identity: "contract-pending", docs: "matrixdock", evidence: [evidence("matrixdockBnb", "Issuer describes XAUm on BNB; no contract admitted")] },
  { id: "ondo-catalog", name: "Ondo Stocks", chainId: 56, categories: ["stocks", "etfs"], issuer: "Ondo Global Markets (BVI) Limited", kind: "securities-catalog", legalProductType: "Issuer-specific tokenized securities catalog; per-product legal review pending", backing: "Provider describes underlying securities held with custodial broker-dealers. Each token's backing and rights require its own governing documents; these are not ordinary shares or ETF units.", eligibilityMode: "provider-verification-required", marketHours: securityHours, rights: "issuer-defined-no-guarantee", identity: "catalog-only", docs: "ondoEligibility", evidence: [evidence("ondo", "BNB stocks and ETF catalog presence"), evidence("ondoEligibility", "Issuer-specific prohibited and restricted persons"), evidence("metamask", "Provider geography and market-hour quote limits")] },
  { id: "xstocks-catalog", name: "xStocks", chainId: 56, categories: ["stocks", "etfs"], issuer: "Backed Assets (JE) Limited", kind: "securities-catalog", legalProductType: "Issuer-specific tokenized equity and ETF products; individual terms pending", backing: "Issuer describes tokenized U.S. equity and ETF exposure. Token holders are not guaranteed shareholder voting, ownership or dividend rights by FlowBridge.", eligibilityMode: "provider-verification-required", marketHours: securityHours, rights: "issuer-defined-no-guarantee", identity: "catalog-only", docs: "xstocks", evidence: [evidence("xstocks", "BNB launch 29 April 2026; not available in US or to US persons")] },
  { id: "bstocks-catalog", name: "bStocks", chainId: 56, categories: ["stocks"], issuer: "Binance bStocks — legal issuing entity review pending", kind: "securities-catalog", legalProductType: "Tokenized securities catalog; legal issuing entity and individual products pending", backing: "BNB Chain's announcement describes 1:1-backed U.S. securities with regulated custody. Marketing statements are not verified individual contract, investor-rights or FlowBridge execution evidence.", eligibilityMode: "provider-verification-required", marketHours: securityHours, rights: "issuer-defined-no-guarantee", identity: "catalog-only", docs: "bstocks", evidence: [evidence("bstocks", "BNB ecosystem announcement only; per-token proof pending")] },
];
/** Snapshot only, not a worldwide eligibility decision or shared issuer blacklist. */
export const ONDO_PROHIBITED = ["Afghanistan", "Belarus", "Canada", "Crimea, DNR, LNR, Kherson, Zaporizhzhia and Sevastopol (Ukraine)", "Cuba", "Democratic Republic of Korea", "Iran", "Libya", "Myanmar", "Russia", "Somalia", "South Sudan", "Sudan", "Syria", "United States (including territories and U.S. persons)"] as const;
export const ONDO_RESTRICTED = ["Brazil", "European Economic Area", "Hong Kong", "Malaysia", "Singapore", "Switzerland", "United Kingdom"] as const;
export const READINESS_CHECKS = ["issuer-contract", "dex-listing", "exact-route", "executable-quote", "liquidity-slippage-fees", "eligibility", "provider-permission"] as const;
export type ReadinessCheck = typeof READINESS_CHECKS[number];
export type Readiness = Record<ReadinessCheck, "verified" | "pending">;
/** A dated listing snapshot permits discovery only, never financial readiness. */
export function readiness(id: string, chainId: number): Readiness {
  const asset = RWA_REGISTRY.find(a => a.id === id && a.chainId === chainId);
  return {
    "issuer-contract": asset?.identity === "issuer-contract-confirmed" && asset.contract ? "verified" : "pending",
    "dex-listing": asset?.dexListing ? "verified" : "pending",
    "exact-route": "pending", // V1.1 archived local chain evidence is separate; no current release/provider gate is promoted.
    "executable-quote": "pending", "liquidity-slippage-fees": "pending",
    "eligibility": "pending", "provider-permission": "pending",
  };
}
export function passesReadiness(checks: Readiness): boolean {
  return READINESS_CHECKS.every(key => checks[key] === "verified");
}
export function browseAssets(category: Category): readonly RwaEntry[] {
  return RWA_REGISTRY.filter(a => a.categories.includes(category) && a.identity === "issuer-contract-confirmed" && a.contract && a.dexListing);
}
export function researchAssets(category: Category): readonly RwaEntry[] {
  const admitted = new Set(browseAssets(category).map(a => a.id));
  return RWA_REGISTRY.filter(a => a.categories.includes(category) && !admitted.has(a.id));
}
export function discoveryPreviewAllowed(development: boolean): boolean { return development === true; }
export function sourceUrl(id: SourceId): string | undefined {
  return Object.prototype.hasOwnProperty.call(SOURCES, id) ? SOURCES[id] : undefined;
}
export function explorerUrl(id: string, chainId: number): string | undefined {
  const asset = RWA_REGISTRY.find(a => a.id === id && a.chainId === chainId);
  return asset?.identity === "issuer-contract-confirmed" && asset.contract && chainId === 56
    ? `https://bscscan.com/token/${asset.contract}` : undefined;
}
export function availability(id: string, chainId: number) {
  const asset = RWA_REGISTRY.find(a => a.id === id && a.chainId === chainId);
  return { canBuy: false as const, canClaim: false as const, canApprove: false as const,
    state: !asset ? "unsupported" as const : asset.dexListing && asset.identity === "issuer-contract-confirmed" ? "dex-listed-pending" as const : "research-only" as const };
}