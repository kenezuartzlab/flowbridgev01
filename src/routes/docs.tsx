/**
 * Public documentation hub: Whitepaper, product docs, contracts & security.
 * PUBLIC ONLY. BOT Ecosystem Support application materials are private and
 * must never be linked from here (they live in the admin console).
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Download, ExternalLink, ShieldCheck, FileText } from "lucide-react";
import { AppTopBar } from "@/components/layout/AppTopBar";
import { BottomNav } from "@/components/nav/BottomNav";
import whitepaper from "@/assets/whitepaper.pdf.asset.json";
import { PRODUCTION_CONTRACTS } from "@/lib/contracts/productionRegistry";

const TITLE = "Documentation — FlowBridge Whitepaper, Guides & Contracts";
const DESC =
  "Read the FlowBridge Whitepaper, product guides for Swap, Bridge, MultiSend and Staking, and the verified contract addresses and security practices.";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://flowbridge.space/docs" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://flowbridge.space/docs" }],
  }),
  component: DocsPage,
});

const GUIDES = [
  { title: "Trade (Swap & Bridge)", body: "Swap tokens on BOT Chain and bridge between supported networks. The exact protocol fee for your selected route (currently 0.01% on BOT Mainnet) is shown before you confirm.", to: "/trade" },
  { title: "MultiSend", body: "Distribute to many wallets, consolidate many wallets into one, or run advanced batches. 0.01% fee, no funds held by the contract.", to: "/multisend" },
  { title: "Staking", body: "Lock FLOW for the approved term. Estimates are shown before you sign; nothing is guaranteed.", to: "/stake" },
  { title: "Ways to earn", body: "FLOW Points, campaigns and rewards explained in plain English.", to: "/learn" },
] as const;

function DocsPage() {
  const live = PRODUCTION_CONTRACTS;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppTopBar eyebrow="Docs" title="Documentation" initial="D" />
      <main className="mx-auto w-full max-w-2xl space-y-4 px-3 pt-3 sm:px-4 md:max-w-4xl md:pt-6" style={{ paddingBottom: "calc(84px + env(safe-area-inset-bottom, 0px))" }}>
        <section className="fb-surface p-4">
          <p className="fb-eyebrow flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5 text-primary" />Whitepaper</p>
          <h1 className="mt-2 text-[20px] font-black leading-tight">FlowBridge Whitepaper v1.1</h1>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">The product vision, architecture, token design and roadmap behind FlowBridge.</p>
          <a href={whitepaper.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.1em] text-primary">
            <Download className="h-3.5 w-3.5" />Read the whitepaper (PDF)
          </a>
        </section>

        <section className="fb-surface p-4">
          <p className="fb-eyebrow flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-primary" />Product documentation</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {GUIDES.map((g) => (
              <Link key={g.to} to={g.to} className="rounded-xl border border-hairline p-3 transition-colors hover:border-primary/40">
                <p className="text-[13px] font-bold">{g.title}</p>
                <p className="mt-1 text-[12px] text-muted">{g.body}</p>
              </Link>
            ))}
          </div>
        </section>

        <section id="contracts" className="fb-surface p-4">
          <p className="fb-eyebrow flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-primary" />Contracts & security</p>
          <ul className="mt-3 space-y-2">
            {live.map((n) => (
              <li key={`${n.chainId}:${n.address}`} className="min-w-0 rounded-lg border border-hairline p-3 [overflow-wrap:anywhere]">
                <p className="text-[12.5px] font-bold">{n.name} · {n.network} · {n.chainId}</p>
                <p className="mt-1 text-[11px] text-muted">{n.state} — {n.purpose}</p>
                <a href={n.explorer} target="_blank" rel="noreferrer" className="mt-1 flex items-start gap-1 font-mono text-[11px] text-primary">
                  <span className="min-w-0 break-all">{n.address}</span><ExternalLink className="h-3 w-3 shrink-0" />
                </a>
                <p className="mt-1 text-[10.5px] text-muted">{n.verification}</p>
              </li>
            ))}
          </ul>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-[12px] text-muted">
            <li>Verification evidence is identified per contract; bytecode presence is not a security audit. External integrations are not FlowBridge-owned contracts.</li>
            <li>Exact approvals are shown before signing. MultiSend leaves no residual funds after a successful batch; the staking vault intentionally holds locked user principal separately from rewards.</li>
            <li>Every transaction is shown for review and signed in your own wallet.</li>
          </ul>
        </section>

        <Link to="/bot-chain" className="fb-surface block p-4 transition-colors hover:border-primary/40">
          <p className="text-[13px] font-bold">How FlowBridge supports BOT Chain →</p>
          <p className="mt-1 text-[12px] text-muted">Our role in the ecosystem and our Builder Challenge #1 recognition.</p>
        </Link>
      </main>
      <BottomNav />
    </div>
  );
}
