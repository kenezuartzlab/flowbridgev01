import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppTopBar } from "@/components/layout/AppTopBar";
import { BottomNav } from "@/components/nav/BottomNav";
import { discoverPools, type DiscoveredPool } from "@/lib/swap/quoter";
import { getCuratedTokens } from "@/lib/swap/tokenRegistry";

export const Route = createFileRoute("/liquidity")({
  head: () => ({
    meta: [
      { title: "Liquidity — FlowBridge" },
      { name: "description", content: "Live BDEX liquidity pools on BOT Chain, read directly from the chain." },
      { property: "og:title", content: "Liquidity — FlowBridge" },
      { property: "og:description", content: "Live BDEX liquidity pools on BOT Chain, read directly from the chain." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LiquidityPage,
});

function LiquidityPage() {
  const [pools, setPools] = useState<DiscoveredPool[] | null>(null);
  useEffect(() => {
    discoverPools(getCuratedTokens(true), true).then(setPools).catch(() => setPools([]));
  }, []);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppTopBar eyebrow="Trade" title="Liquidity" initial="L" />
      <main className="mx-auto w-full max-w-2xl space-y-3 px-3 pt-3" style={{ paddingBottom: "calc(84px + env(safe-area-inset-bottom, 0px))" }}>
        <section className="fb-surface p-4">
          <p className="fb-eyebrow">Live BDEX pools · BOT Chain</p>
          <p className="mt-1 text-[12px] text-muted">Only pools with live on-chain liquidity are shown. No TVL, APR or volume is estimated.</p>
          <div className="mt-3 space-y-2">
            {pools === null && <p className="text-[12px] text-muted">Reading pools…</p>}
            {pools?.length === 0 && <p className="text-[12px] text-muted">No pools could be read right now.</p>}
            {pools?.map((p) => (
              <a key={p.pool} href={`https://scan.botchain.ai/address/${p.pool}`} target="_blank" rel="noreferrer"
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline p-3">
                <span className="text-[13px] font-bold">{p.pair}</span>
                <span className="font-mono text-[11px] text-muted">
                  {p.dex}{p.feeTier != null ? ` · ${(p.feeTier / 10_000).toFixed(2)}%` : ""}
                </span>
              </a>
            ))}
          </div>
        </section>
        <section className="fb-surface p-4 text-[12px] text-muted">
          <p className="fb-eyebrow">Add liquidity · Create pool · My positions</p>
          <p className="mt-1">Coming next. These open once the BDEX position contract is confirmed in FlowBridge's verified records — we won't guess it.</p>
          <Link to="/trade" className="mt-2 inline-block font-bold text-primary">Back to Swap →</Link>
        </section>
      </main>
      <BottomNav />
    </div>
  );
}
