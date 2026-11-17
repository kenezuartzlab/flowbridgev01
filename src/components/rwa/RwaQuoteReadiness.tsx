import { useState } from "react";
import { Activity, ArrowUpRight, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QUOTE_SNAPSHOT as snapshot } from "@/lib/rwa/quoteSnapshot";
import { POOL_GATE, identityFailures, sizeFailures } from "@/lib/rwa/quoteReadiness";

export function RwaQuoteReadiness() {
  const [direction,setDirection] = useState("buy");
  const valid = snapshot.chainGate === "VERIFIED" && identityFailures(snapshot.facts).length === 0;
  return <section data-testid="rwa-quote-readiness" className="min-w-0 border-y border-hairline py-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-base font-bold"><Activity size={18} className="text-primary" aria-hidden/>XAUt / USDT quote readiness</h2>
      <span className="text-xs font-semibold text-warning">{valid ? "Read-only quote · Archived" : "Blocked"}</span>
    </div>
    <p className="mt-2 text-xs leading-relaxed text-muted">Direct PancakeSwap V3 pool · 0.05% pool fee · BNB Chain 56. Historical on-chain simulations, not current offers or permission to trade.</p>
    <dl className="mt-4 grid min-w-0 gap-3 text-xs sm:grid-cols-3">
      <div><dt className="text-muted">Exact pool</dt><dd className="mt-1 font-semibold text-success">{valid ? "Two endpoints matched" : "Unverified"}</dd></div>
      <div><dt className="text-muted">BSC block</dt><dd className="mt-1 font-mono">{snapshot.blockNumber.toLocaleString("en-US")}</dd></div>
      <div><dt className="text-muted">Block time · UTC</dt><dd className="mt-1">{snapshot.blockTime.replace("T"," ").replace(".000Z","")}</dd></div>
    </dl>
    <p className="mt-3 text-xs leading-relaxed text-warning">Archived snapshot · not fresh. Proposed quote TTL 60 seconds, maximum block age 30 seconds; neither authorizes execution.</p>
    {valid && <>
      <Tabs value={direction} onValueChange={setDirection} className="mt-4">
        <TabsList aria-label="Read-only quote direction" className="grid h-auto w-full grid-cols-2 bg-card p-1 sm:max-w-md">
          <TabsTrigger value="buy" className="min-h-11 whitespace-normal text-xs">USDT → XAUt</TabsTrigger>
          <TabsTrigger value="sell" className="min-h-11 whitespace-normal text-xs">XAUt → USDT</TabsTrigger>
        </TabsList>
      </Tabs>
      <p className="mt-3 text-xs text-muted">{direction === "buy" ? "Exact USDT input → simulated XAUt output." : "Exact XAUt input equals the matching buy simulation output; sell simulations start from the same original pool block."} USDT is not assumed to equal USD; no external gold valuation is used.</p>
      <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {snapshot.sizes.map(s => <article key={s.usdtSize} className="min-w-0 rounded-md border border-hairline bg-card p-3 text-xs">
          <p className="font-semibold">{s.usdtSize.toLocaleString("en-US")} USDT size</p>
          <p className="mt-3 break-all font-mono text-muted">{direction === "buy" ? `${s.usdtSize} USDT` : `${s.xautInput} XAUt`}</p>
          <p className="mt-1 break-all font-mono font-semibold">→ {direction === "buy" ? `${s.buyOutput} XAUt` : `${Number(s.sellOutput).toFixed(6)} USDT`}</p>
          <dl className="mt-3 space-y-1.5 text-muted">
            <div className="flex justify-between gap-2"><dt>Spot deviation¹</dt><dd>{(direction === "buy" ? s.buyImpactBps : s.sellImpactBps).toFixed(2)} bps</dd></div>
            <div className="flex justify-between gap-2"><dt>Quoter gas²</dt><dd>{(direction === "buy" ? s.buyGas : s.sellGas).toLocaleString("en-US")}</dd></div>
            <div className="flex justify-between gap-2"><dt>Round-trip loss</dt><dd>{s.roundTripLossBps.toFixed(2)} bps</dd></div>
          </dl>
          <p className="mt-3 text-[10px] font-semibold text-warning">{sizeFailures(s).length ? "Blocked by proposed limits" : "Proposed limits only · not approved"}</p>
        </article>)}
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-muted">¹ Includes pool fees, rounding and curve movement relative to slot0; not a gold oracle or pure curve-only impact. ² Quoter estimate excludes wallet transaction, approvals, network fee and future adapter costs. Round-trip loss excludes gas and integrator fees; it is not a sequential swap simulation.</p>
    </>}
    <details className="mt-3 border-t border-hairline">
      <summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold">Sources & remaining gates</summary>
      <dl className="space-y-3 text-xs leading-relaxed">
        <div><dt className="font-semibold">Pinned pool</dt><dd className="break-all font-mono text-muted">{POOL_GATE.pool}</dd></div>
        <div><dt className="font-semibold">Read sources</dt><dd className="break-all text-muted">bsc-dataseed.bnbchain.org · bsc-dataseed1.bnbchain.org</dd></div>
        <div><dt className="font-semibold">Observed · UTC</dt><dd className="text-muted">{snapshot.observedAt}</dd></div>
        <div><dt className="font-semibold">Health & token behavior · Unverified</dt><dd className="text-muted">Active liquidity is nonzero and all five sizes simulated both ways. Wider liquidity concentration, proxy/freeze/blacklist/fee-on-transfer behavior and sustained depth remain unverified.</dd></div>
        <div><dt className="font-semibold">Legal, provider & fees · Blocked</dt><dd className="text-muted">Issuer eligibility, integration permission, fee-preserving adapter review and separate owner fee approval remain open. External aggregator quotes and profitability are unverified.</dd></div>
      </dl>
      <Button variant="link" asChild className="mt-2 h-auto min-h-11 justify-start whitespace-normal px-0 text-xs"><a href="https://developer.pancakeswap.finance/contracts/v3/addresses" target="_blank" rel="noopener noreferrer">Official PancakeSwap V3 addresses<ArrowUpRight aria-hidden/></a></Button>
    </details>
    <p className="mt-3 flex items-start gap-2 text-xs font-semibold text-muted"><LockKeyhole size={14} className="mt-0.5 shrink-0" aria-hidden/>Execution disabled · no approvals, signatures or transactions</p>
  </section>;
}