import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { AppTopBar } from "@/components/layout/AppTopBar";
import { BottomNav } from "@/components/nav/BottomNav";
import { OFFICIAL_LAUNCH_AT, LAUNCH_ARTICLE_PATH } from "@/lib/application/officialLaunch";

const TITLE = "FlowBridge Officially Launches on BOT Chain Mainnet";
const DESC = "FlowBridge has officially launched on BOT Chain Mainnet: Trade, Bridge, MultiSend, Staking, Rewards and Flow AI in one non-custodial experience.";
const URL = `https://flowbridge.space${LAUNCH_ARTICLE_PATH}`;

export const Route = createFileRoute("/blog/flowbridge-officially-launches-on-bot-chain-mainnet")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "article" },
      { property: "og:url", content: URL },
      { property: "article:published_time", content: OFFICIAL_LAUNCH_AT },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: LaunchArticle,
});

const CAPS: [string, string][] = [
  ["Trade", "Live route discovery and quotes through FlowBridge routers, with review, price-impact visibility and explicit approvals. The exact protocol fee for the selected route is shown before you sign. Availability depends on current liquidity and simulation."],
  ["Bridge", "Guided transfers using the official BOT Bridge integration. Source confirmation is not destination completion; destination receipt must be verified."],
  ["MultiSend", "Distribution, consolidation and advanced transfer workflows. Each wallet confirms its own transactions; Activity groups the session with every receipt."],
  ["Staking", "Flexible, 30D, 90D, 180D and 365D on BOT Mainnet, with terms, availability and rewards read from the contracts. Rewards are not guaranteed; the variable-reward oracle is disabled."],
  ["Rewards", "Verified activity supports server-derived FLOW progression and claims, subject to the 1,000 FLOW minimum and applicable claim conditions."],
  ["Flow AI", "Guided ecosystem discovery and action preparation. Flow AI never signs or spends for you; every action is reviewed and confirmed in your wallet."],
];

const LINKS: [string, string][] = [
  ["Website", "https://flowbridge.space"],
  ["X", "https://x.com/flowbridgeweb3"],
  ["Telegram", "https://t.me/flowbridgeweb"],
  ["BOT Chain", "https://botchain.ai"],
  ["Explorer", "https://scan.botchain.ai"],
];

function LaunchArticle() {
  const date = new Date(OFFICIAL_LAUNCH_AT).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppTopBar eyebrow="Blog" title="Launch" initial="B" />
      <main className="mx-auto w-full max-w-2xl space-y-4 px-3 pt-3 sm:px-4 md:pt-6" style={{ paddingBottom: "calc(84px + env(safe-area-inset-bottom, 0px))" }}>
        <article className="fb-surface space-y-4 p-4 text-[13.5px] leading-relaxed [overflow-wrap:anywhere]">
          <header>
            <p className="fb-eyebrow">Announcement · <time dateTime={OFFICIAL_LAUNCH_AT}>{date}</time></p>
            <h1 className="mt-2 text-[22px] font-black leading-tight">{TITLE}</h1>
          </header>
          <p className="font-bold">FlowBridge has officially launched on BOT Chain Mainnet.</p>
          <p className="text-muted">FlowBridge is a non-custodial Web3 toolkit bringing Trade, Bridge, MultiSend, Staking, Rewards and Flow AI into a guided ecosystem experience. Its production network is BOT Mainnet, chain ID 677.</p>
          <h2 className="text-[16px] font-black">Why BOT Chain</h2>
          <p className="text-muted">FlowBridge builds around BOT Chain's liquidity venues, native assets and cross-chain infrastructure. The aim is useful participation: understandable actions, transparent contracts and genuine activity.</p>
          <h2 className="text-[16px] font-black">Live product capabilities</h2>
          <ul className="space-y-2">{CAPS.map(([t, b]) => <li key={t}><span className="font-bold">{t}: </span><span className="text-muted">{b}</span></li>)}</ul>
          <h2 className="text-[16px] font-black">Your wallet stays in control</h2>
          <p className="text-muted">Connecting a wallet does not authorize spending. Ownership binding is a separate explicit signature. Approvals and execution are reviewed and confirmed in your own wallet, and success is based on confirmed receipts and Activity, not on a submitted hash alone.</p>
          <h2 className="text-[16px] font-black">Contracts &amp; security</h2>
          <p className="text-muted">Review the current <Link to="/docs" className="text-primary">Contracts &amp; Security documentation</Link> and the <Link to="/bot-chain" className="text-primary">BOT Chain ecosystem page</Link>. FlowBridge-owned contracts and external integrations are labeled separately.</p>
          <h2 className="text-[16px] font-black">Builder Challenge recognition</h2>
          <p className="text-muted">1st Place - EVM Deployment Track, BOT Chain Builder Challenge #1</p>
          <h2 className="text-[16px] font-black">Genuine ecosystem growth</h2>
          <p className="text-muted">FlowBridge supports practical BOT Chain use through trading and liquidity discovery, cross-chain onboarding, batch transfers, staking, education and verifiable participation.</p>
          <ul className="flex flex-wrap gap-2 pt-2">{LINKS.map(([l, h]) => <li key={l}><a href={h} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-xl border border-hairline px-3 py-1.5 text-[12px] font-bold text-primary">{l}<ExternalLink className="h-3 w-3" /></a></li>)}</ul>
        </article>
      </main>
      <BottomNav />
    </div>
  );
}
