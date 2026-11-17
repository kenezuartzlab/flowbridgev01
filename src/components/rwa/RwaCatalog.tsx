import { useState } from "react";
import { ArrowUpRight, ChevronDown, Gem, ShieldCheck, LockKeyhole, Landmark, Layers3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { REVIEWED_AT, ONDO_PROHIBITED, ONDO_RESTRICTED, sourceUrl, explorerUrl, availability, browseAssets, researchAssets, readiness, READINESS_CHECKS, type ReadinessCheck, type RwaEntry, type SourceId } from "@/lib/rwa/registry";
import gold from "@/assets/rwa-gold.jpg";
import { RwaQuoteReadiness } from "./RwaQuoteReadiness";

function SourceLink({ id, children }: { id: SourceId; children: React.ReactNode }) {
  const url = sourceUrl(id);
  return url ? <Button variant="link" asChild className="h-auto min-h-11 whitespace-normal justify-start p-0 text-xs"><a href={url} target="_blank" rel="noopener noreferrer">{children}<ArrowUpRight aria-hidden /></a></Button> : null;
}

function AssetCard({ asset }: { asset: RwaEntry }) {
  const [expanded, setExpanded] = useState(false);
  const confirmed = asset.identity === "issuer-contract-confirmed";
  const url = explorerUrl(asset.id, asset.chainId);
  const state = availability(asset.id, asset.chainId);
  const checks = readiness(asset.id, asset.chainId);
  const labels: Record<ReadinessCheck, string> = { "issuer-contract": "Issuer BNB contract", "dex-listing": "DEX listing snapshot", "exact-route": "Independent exact-route verification", "executable-quote": "Current executable quote", "liquidity-slippage-fees": "Liquidity, slippage & fees", "eligibility": "Product-specific eligibility", "provider-permission": "Provider integration permission" };
  return <article className="rwa-enter flex min-w-0 flex-col rounded-lg border border-hairline bg-card p-4 sm:p-5" data-rwa-asset={asset.id} data-availability={state.state}>
    <div className="flex items-start justify-between gap-2">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-warning/10 text-warning">{asset.kind === "allocated-metal-token" ? <Gem aria-hidden size={20}/> : <Landmark aria-hidden size={20}/>}</span>
      <span className="rounded border border-hairline px-2 py-1 text-[10px] font-semibold text-muted">BNB Chain · 56</span>
    </div>
    <div className="mt-4 flex flex-wrap items-baseline gap-2"><h2 className="text-lg font-bold">{asset.name}</h2>{asset.symbol && <span className="font-mono text-xs text-muted">{asset.symbol}</span>}</div>
    <p className="mt-1 text-xs leading-relaxed text-muted">{asset.issuer}</p>
    <p className={`mt-3 flex items-center gap-1.5 text-xs font-medium ${confirmed ? "text-success" : "text-warning"}`}>{confirmed ? <ShieldCheck size={14} aria-hidden/> : <Layers3 size={14} aria-hidden/>}{confirmed ? "Issuer contract confirmed" : asset.identity === "contract-pending" ? "Exact contract pending" : "Issuer catalog · not individual tokens"}</p>
    <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{asset.backing}</p>
    {asset.dexListing && <p className="mt-3 text-xs font-semibold">XAUt / USDT · PancakeSwap V3 · AMM</p>}
    <div className="mt-4 border-t border-hairline pt-3"><p className="flex items-start gap-2 text-xs leading-relaxed text-muted"><LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden/>Listed on DEX / FlowBridge trading pending</p></div>
    <Button variant="ghost" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-controls={`details-${asset.id}`} className="mt-2 min-h-11 w-full justify-between px-0 text-xs">Identity, risks & sources<ChevronDown className={expanded ? "rotate-180" : ""} aria-hidden/></Button>
    {expanded && <div id={`details-${asset.id}`} className="border-t border-hairline pt-3 text-xs leading-relaxed">
      <dl className="space-y-3">
        <div><dt className="font-semibold">Legal product</dt><dd className="mt-1 text-muted">{asset.legalProductType}</dd></div>
        <div><dt className="font-semibold">Market availability</dt><dd className="mt-1 text-muted">{asset.marketHours}</dd></div>
        <div><dt className="font-semibold">Eligibility</dt><dd className="mt-1 text-muted">{asset.eligibilityMode === "issuer-terms" ? "Issuer purchase, custody and redemption restrictions apply. Metal tokens are not ordinary stocks; access is not approved here." : "Securities access is closed in every region on FlowBridge. Legal review and provider-specific eligibility verification, including KYC where required, are pending. Self-attestation or a wallet connection does not establish eligibility."}</dd></div>
        <div><dt className="font-semibold">Rights & risk</dt><dd className="mt-1 text-muted">No guaranteed investor or shareholder rights. Issuer, custody, collateral, redemption, pricing, smart-contract and counterparty risks apply. Review the exact product terms.</dd></div>
        {asset.contract && <div><dt className="font-semibold">BNB BEP20 contract</dt><dd className="mt-1 break-all font-mono text-muted">{asset.contract}</dd></div>}
        {asset.dexListing && <div><dt className="font-semibold">Reported existing AMM pair</dt><dd className="mt-1 break-all font-mono text-muted">{asset.dexListing.pair}</dd><dd className="mt-1 text-muted">USDT contract: <span className="break-all font-mono">{asset.dexListing.quoteContract}</span></dd><dd className="mt-1 text-muted">Listing provenance is DEX Screener. Separate archived chain verification and simulations appear below; current health and provider-authorized execution remain unverified. This is not a PancakeSwapX RFQ route.</dd></div>}
      </dl>
      <dl className="mt-4 space-y-2 border-t border-hairline pt-3">{READINESS_CHECKS.map(key => <div key={key} className="flex items-start justify-between gap-3"><dt className="text-muted">{labels[key]}</dt><dd className={checks[key] === "verified" ? "text-success" : "text-warning"}>{checks[key] === "verified" ? "Evidence reviewed" : "Pending"}</dd></div>)}</dl>
      <div className="mt-3 space-y-1">{asset.evidence.map(e => <div key={e.source}><p className="text-muted">{e.claim}</p><SourceLink id={e.source}>{e.source === "xautDex" ? "Third-party DEX listing evidence" : "Official evidence"}</SourceLink></div>)}</div>
      <SourceLink id={asset.docs}>Issuer / product disclosures</SourceLink>
      {url && <div><Button variant="link" asChild className="h-auto min-h-11 p-0 text-xs"><a href={url} target="_blank" rel="noopener noreferrer">Contract on BscScan<ArrowUpRight aria-hidden/></a></Button></div>}
      <p className="mt-2 text-[10px] text-muted">Source review · {REVIEWED_AT.slice(0, 10)} · identity evidence is not liquidity verification.</p>
    </div>}
  </article>;
}

export function RwaCatalog() {
  return <div data-testid="rwa-catalog" className="min-w-0 space-y-6">
    <section className="rwa-cover relative isolate overflow-hidden border-y border-hairline">
      <img src={gold} alt="Illustrative gold bullion bars, not issuer custody evidence" width={1536} height={768} className="absolute inset-0 -z-10 h-full w-full object-cover object-right"/>
      <div className="rwa-cover-copy max-w-md px-5 py-7 sm:px-7 sm:py-10">
        <p className="text-xs font-semibold uppercase">BNB Chain · Research preview</p>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">FlowBridge RWA Markets</h1>
        <p className="mt-3 max-w-xs text-sm leading-relaxed">Existing on-chain assets. Existing DEX liquidity. Gold first, with issuer-specific rights and access restrictions.</p>
        <p className="mt-5 inline-flex items-center gap-2 text-xs font-semibold"><LockKeyhole size={14} aria-hidden/>Read-only · Release HOLD</p>
      </div>
    </section>
    <Tabs defaultValue="metals">
      <TabsList aria-label="RWA asset categories" className="grid h-auto w-full grid-cols-3 gap-1 bg-card p-1">
        <TabsTrigger value="metals" className="min-h-11 whitespace-normal px-1 text-xs">Gold & Metals</TabsTrigger>
        <TabsTrigger value="stocks" className="min-h-11 whitespace-normal px-1 text-xs">Tokenized Stocks</TabsTrigger>
        <TabsTrigger value="etfs" className="min-h-11 whitespace-normal px-1 text-xs">ETFs</TabsTrigger>
      </TabsList>
      {(["metals", "stocks", "etfs"] as const).map(category => <TabsContent key={category} value={category} className="mt-5 space-y-4">
        <p className="text-xs leading-relaxed text-muted">{category === "metals" ? "XAUt / USDT is the first existing DEX candidate. Listing evidence is not an executable quote; trading remains closed." : "No individual token meets our issuer-contract and exact DEX-listing evidence threshold yet. Tokenized exposure is not ownership of ordinary shares or ETF units."}</p>
        <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">{browseAssets(category).map(asset => <AssetCard key={asset.id} asset={asset}/>)}</div>
        {!browseAssets(category).length && <p className="border-y border-hairline py-5 text-sm font-semibold">No supported {category === "etfs" ? "ETF" : "stock"} tokens yet</p>}
        {category === "metals" && <RwaQuoteReadiness/>}
        <details className="border-t border-hairline pt-2"><summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold">Not supported · Research only</summary>
          <ul className="space-y-3 text-xs leading-relaxed text-muted">{researchAssets(category).map(asset => <li key={asset.id}><span className="font-semibold text-foreground">{asset.name}</span> — {asset.id === "ondo-catalog" ? "PancakeSwapX documents BNB Ondo support via off-chain filler / intent orders. Per-token issuer proof, exact RFQ route, current quotes and region approval are not verified." : asset.id === "bstocks-catalog" ? "Priority for verification after XAUt. The supplied PancakeSwap bStocks article currently returns a 404; individual issuer contracts and DEX routes are not verified." : "No issuer-confirmed BNB contract plus exact current DEX listing admitted here."}</li>)}</ul>
          {category !== "metals" && <><SourceLink id="pancake">PancakeSwap RWA support</SourceLink><div><SourceLink id="pancakeFaq">PancakeSwapX intent / filler model</SourceLink></div></>}
        </details>
      </TabsContent>)}
    </Tabs>
    <section className="border-t border-hairline pt-5 text-sm leading-relaxed">
      <h2 className="flex items-center gap-2 text-base font-bold"><ShieldCheck size={18} className="text-primary" aria-hidden/>Eligibility is product-specific</h2>
      <p className="mt-2 text-muted">Securities trading is closed for all regions on FlowBridge. Metal tokens have separate issuer purchase and redemption rules. Being on BNB Chain does not make either universally available.</p>
      <details className="mt-3"><summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold">Dated jurisdiction information · 17 November 2026</summary>
        <p className="mt-2 text-xs text-muted">Ondo prohibited jurisdictions/persons: {ONDO_PROHIBITED.join("; ")}. Sanctions, entity control and other issuer criteria also apply.</p>
        <p className="mt-3 text-xs text-muted">Ondo restricted investor categories: {ONDO_RESTRICTED.join(", ")}. These are not retail approvals; Switzerland excludes individuals in the reviewed issuer table.</p>
        <p className="mt-3 text-xs text-muted">xStocks excludes the U.S. and U.S. persons; other provider geography restrictions apply. bStocks restrictions and exact issuing entity remain pending. No shared whitelist, location collection or eligibility certification is offered.</p>
        <SourceLink id="ondoEligibility">Current Ondo eligibility</SourceLink>
      </details>
      <p className="mt-3 text-xs text-muted">No balances or current executable offers are presented. Archived pool simulations do not approve access. No token issuance, pool creation or funding, issuer partnerships, minting or redemption marketplace. Source review is not an audit of collateral or investment advice.</p>
    </section>
  </div>;
}