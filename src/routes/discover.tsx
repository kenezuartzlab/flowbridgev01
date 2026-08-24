/**
 * FlowBridge V28 §6/§7/§8 — the BOT Chain ecosystem discovery surface.
 *
 * Only real availability is shown: canonical opportunities from the frozen
 * decision result plus existing FlowBridge product and learning surfaces. There
 * is no invented APY, no fake reward pool, no participation count, no countdown
 * and no "trending" claim, and every card is navigation only.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, ChevronDown, Compass, Sparkles } from "lucide-react";
import { AppTopBar } from "@/components/layout/AppTopBar";
import { BottomNav } from "@/components/nav/BottomNav";
import { AccountActivationCard } from "@/components/growth/AccountActivationCard";
import { useDecisionFeed } from "@/lib/ai/experience/useDecisionFeed";
import {
  buildDiscovery,
  DISCOVERY_LABEL_MEANING,
  type DiscoveryItem,
} from "@/lib/growth/ecosystemDiscovery";
import { trackActivation } from "@/lib/growth/activationAnalytics";

const TITLE = "Discover BOT Chain — FlowBridge";
const DESC =
  "Find what is really live on BOT Chain: FlowBridge trading, bridging, staking, campaigns and plain-English guides, with the rules and limits stated on every card.";

export const Route = createFileRoute("/discover")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://flowbridge.space/discover" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://flowbridge.space/discover" }],
  }),
  component: DiscoverPage,
});

function LabelChip({ label }: { label: DiscoveryItem["label"] }) {
  const tone =
    label === "VERIFIED"
      ? "border-success/40 bg-success/10 text-success"
      : label === "EXTERNAL"
        ? "border-hairline text-muted"
        : "border-primary/40 bg-primary/10 text-primary";
  return (
    <span
      title={DISCOVERY_LABEL_MEANING[label]}
      className={`rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-black uppercase tracking-[0.08em] ${tone}`}
    >
      {label === "VERIFIED" ? "Verified" : label === "EXTERNAL" ? "External" : "Preview"}
    </span>
  );
}

function DiscoveryCard({ item }: { item: DiscoveryItem }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="fb-surface overflow-hidden" data-testid="discovery-item" data-item-id={item.id}>
      <div className="flex items-start justify-between gap-2 px-4 pt-3.5">
        <h3 className="text-[13px] font-bold leading-snug text-foreground">{item.title}</h3>
        <LabelChip label={item.label} />
      </div>
      <p className="px-4 pt-1.5 text-[11.5px] leading-relaxed text-muted">{item.what}</p>
      <p className="px-4 pt-1.5 text-[11px] leading-relaxed text-muted">
        <span className="font-bold text-foreground/80">Why you might care: </span>
        {item.whyCare}
      </p>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-2 flex min-h-[36px] w-full items-center justify-between gap-2 px-4 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-muted"
      >
        Rules, learning and BOT Chain impact
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <dl className="space-y-2 px-4 pb-1">
          {[
            ["What you can learn or earn", item.learnOrEarn],
            ["The rules", item.rules],
            ["Why this helps BOT Chain", item.whyBotChain],
            ["What happens next", item.whatNext],
          ].map(([label, value]) => (
            <div key={label} className="fb-inset px-3 py-2">
              <dt className="font-mono text-[9px] font-black uppercase tracking-[0.1em] text-muted">
                {label}
              </dt>
              <dd className="mt-0.5 text-[11px] leading-relaxed text-muted">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="p-3.5 sm:p-4">
        <Link
          to={item.href}
          onClick={() => trackActivation("DISCOVERY_ITEM_OPENED", { id: item.id })}
          className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 font-mono text-[10.5px] font-black uppercase tracking-[0.1em] text-primary"
        >
          {item.ctaLabel}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
        {item.requiresWalletConfirmation && (
          <p className="mt-2 font-mono text-[9.5px] leading-relaxed text-muted/80">
            You confirm this yourself in your wallet. FlowBridge never signs for you.
          </p>
        )}
      </div>
    </article>
  );
}

function DiscoverPage() {
  const { decision, signedIn } = useDecisionFeed();
  const view = useMemo(() => buildDiscovery({ decision, signedIn }), [decision, signedIn]);

  useEffect(() => {
    for (const item of view.featured) trackActivation("DISCOVERY_ITEM_SHOWN", { id: item.id });
  }, [view.featured]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppTopBar eyebrow="Ecosystem" title="Discover BOT Chain" />

      <main className="mx-auto w-full max-w-2xl space-y-3.5 px-3 pb-28 pt-3 sm:px-4">
        <section className="fb-surface px-4 py-3.5">
          <p className="fb-eyebrow flex items-center gap-1.5">
            <Compass className="h-3.5 w-3.5 text-primary" />
            Earn. Learn. Grow. Support BOT Chain.
          </p>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
            Everything here is something FlowBridge can actually show you today. Each card states the
            rules, what a label means, and how using it helps BOT Chain — no promised returns.
          </p>
          {view.notice && (
            <p
              className="fb-inset mt-2.5 px-3 py-2 font-mono text-[10px] leading-relaxed text-muted"
              data-testid="discovery-notice"
            >
              {view.notice}
            </p>
          )}
        </section>

        <AccountActivationCard />

        <section className="space-y-1.5">
          <p className="fb-eyebrow flex items-center gap-1.5 px-1">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Featured now
          </p>
          {view.featured.map((item) => (
            <DiscoveryCard key={item.id} item={item} />
          ))}
        </section>

        <section className="space-y-1.5">
          <p className="fb-eyebrow px-1">Everything available</p>
          {view.items.slice(view.featured.length).map((item) => (
            <DiscoveryCard key={item.id} item={item} />
          ))}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
