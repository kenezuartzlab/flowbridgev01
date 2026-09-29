/** Public: how FlowBridge supports BOT Chain + Builder Challenge #1 recognition. */
import { createFileRoute, Link } from "@tanstack/react-router";
import { Trophy, Network, Wrench, Droplets, Compass, ShieldCheck, Info } from "lucide-react";
import { AppTopBar } from "@/components/layout/AppTopBar";
import { BottomNav } from "@/components/nav/BottomNav";
import awards from "@/assets/builder-challenge-awards.jpg.asset.json";

const TITLE = "How FlowBridge Supports BOT Chain — Builder Challenge #1 Winner";
const DESC =
  "FlowBridge won 1st Place in the EVM Deployment Track of BOT Chain Builder Challenge #1. See how swaps, bridging, MultiSend and staking bring real activity to BOT Chain.";

export const Route = createFileRoute("/bot-chain")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://flowbridge.space/bot-chain" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://flowbridge.space/bot-chain" }],
  }),
  component: BotChainPage,
});

const PILLARS = [
  {
    icon: Wrench,
    title: "Creates real BOT Chain utility",
    body: "FlowBridge gives users practical ways to use BOT Chain through trading, bridging, MultiSend, staking and verified reward experiences — all designed around explicit wallet confirmation and real on-chain activity.",
  },
  {
    icon: Droplets,
    title: "Strengthens ecosystem liquidity and trading",
    body: "FlowBridge integrates BOT Chain liquidity venues such as BDEX and helps users discover safe, executable routes. FLOW/USDT trading includes live quotes, price-impact visibility and FlowBridge price-protection controls.",
  },
  {
    icon: Compass,
    title: "Makes BOT Chain easier to use",
    body: "FlowBridge turns complex Web3 actions into guided, mobile-friendly journeys. Users can understand what will happen before signing and move between ecosystem services without needing to understand contract complexity.",
  },
  {
    icon: ShieldCheck,
    title: "Supports verifiable ecosystem growth",
    body: "FlowBridge records genuine on-chain participation instead of manufacturing activity, creating auditable evidence of real ecosystem usage.",
  },
] as const;

function BotChainPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppTopBar eyebrow="Ecosystem" title="BOT Chain" initial="B" />
      <main className="mx-auto w-full max-w-2xl space-y-4 px-3 pt-3 sm:px-4 md:max-w-4xl md:pt-6" style={{ paddingBottom: "calc(84px + env(safe-area-inset-bottom, 0px))" }}>
        <section className="fb-surface p-4">
          <p className="fb-eyebrow flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5 text-primary" />Builder Challenge #1</p>
          <h1 className="mt-2 text-[20px] font-black leading-tight">1st Place — EVM Deployment Track</h1>
          <p className="mt-1.5 text-[12.5px] text-muted">FlowBridge (@flowbridgeweb3) was awarded first place in the EVM Deployment Track of the BOT Chain Builder Challenge #1.</p>
          <img src={awards.url} alt="BOT Chain Builder Challenge #1 Project Awards — FlowBridge 1st place, EVM Deployment Track" className="mt-3 w-full rounded-xl border border-hairline" loading="lazy" />
        </section>
        <section className="fb-surface p-4">
          <p className="fb-eyebrow flex items-center gap-1.5"><Network className="h-3.5 w-3.5 text-primary" />How we support BOT Chain</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {PILLARS.map(([t, b]) => (
              <div key={t} className="rounded-xl border border-hairline p-3">
                <p className="text-[13px] font-bold">{t}</p>
                <p className="mt-1 text-[12px] text-muted">{b}</p>
              </div>
            ))}
          </div>
          <Link to="/docs" className="mt-3 inline-block text-[12px] font-bold text-primary">Read the whitepaper and contract details →</Link>
        </section>
      </main>
      <BottomNav />
    </div>
  );
}
