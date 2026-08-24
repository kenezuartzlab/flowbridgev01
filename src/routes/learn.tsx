/**
 * FlowBridge V27 §6/§7/§8/§10 — the "Ways to Earn" learning centre.
 *
 * One friendly place that explains every real earning path, the reward stage
 * ladder, the staking calculator, and why real activity can support BOT Chain.
 * Read-only and economically inert: no mission, no ActionIntent, no signature.
 * Every control is navigation into a surface that owns its own authorization.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, BookOpen, GraduationCap, Layers, Sparkles } from "lucide-react";
import { AppTopBar } from "@/components/layout/AppTopBar";
import { BottomNav } from "@/components/nav/BottomNav";
import { StatusChip } from "@/components/ai/StatusChip";
import { EARN_PATHS, REWARD_STAGES, type EarnPath } from "@/lib/growth/earnPaths";
import { StakingCalculatorCard } from "@/components/growth/StakingCalculatorCard";
import { OnboardingOverlay } from "@/components/growth/OnboardingOverlay";
import { reopenOnboarding } from "@/lib/growth/onboardingState";

export const Route = createFileRoute("/learn")({
  head: () => ({
    meta: [
      { title: "Ways to Earn — FlowBridge Learning Centre" },
      {
        name: "description",
        content:
          "Learn every real way to earn on FlowBridge: FLOW Points, FLOW claims, staking with a live calculator, campaigns and verified partner opportunities — with the rules in plain English.",
      },
      { property: "og:title", content: "Ways to Earn — FlowBridge Learning Centre" },
      {
        property: "og:description",
        content:
          "FLOW Points, claims, staking estimates and campaign rules explained in plain English — no guaranteed earnings, no hidden terms.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://flowbridge.space/learn" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://flowbridge.space/learn" }],
  }),
  component: LearnPage,
});

function LearnPage() {
  const [replay, setReplay] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {replay && <OnboardingOverlay forceOpen onClose={() => setReplay(false)} />}

      <AppTopBar eyebrow="Learn" title="Ways to earn" initial="L" />

      <main
        className="mx-auto w-full max-w-2xl space-y-4 px-3 pt-3 sm:px-4 sm:pt-4 md:max-w-4xl md:pt-6"
        style={{ paddingBottom: "calc(84px + env(safe-area-inset-bottom, 0px))" }}
      >
        <section className="fb-surface p-4">
          <p className="fb-eyebrow flex items-center gap-1.5">
            <GraduationCap className="h-3.5 w-3.5 text-primary" />
            Earn · Learn · Grow · Support BOT Chain
          </p>
          <h1 className="mt-2 text-[20px] font-black leading-tight tracking-tight">
            Every real way to earn, explained
          </h1>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            Each path below answers the same questions: what it is, how you earn, the rules, what
            could change, what you confirm, and why it can help the BOT Chain ecosystem. Nothing on
            this page moves money.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                reopenOnboarding();
                setReplay(true);
              }}
              data-testid="learn-replay-onboarding"
              className="inline-flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-primary"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Replay the walkthrough
            </button>
            <Link
              to="/assistant"
              className="rounded-xl border border-hairline px-3 py-2 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-muted transition-colors hover:text-foreground"
            >
              Ask Flow AI
            </Link>
          </div>
        </section>

        {/* §7 — the reward stage ladder in canonical order. */}
        <section className="fb-surface overflow-hidden" data-testid="reward-stages">
          <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
            <Layers className="h-3.5 w-3.5 text-primary" />
            <p className="fb-eyebrow">From points to wallet FLOW</p>
          </div>
          <ol className="divide-y divide-hairline/60">
            {REWARD_STAGES.map((s, i) => (
              <li key={s.id} className="flex items-start gap-3 px-4 py-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-primary/12 font-mono text-[10px] font-black text-primary">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block font-mono text-[10.5px] font-black uppercase tracking-[0.1em]">
                    {s.label}
                  </span>
                  <span className="mt-1 block text-[11.5px] leading-relaxed text-muted">
                    {s.body}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <p className="border-t border-hairline px-4 py-3 text-[11px] leading-relaxed text-muted-soft">
            Campaign PTS are a separate scoreboard. They never enter this ladder and never convert
            into FLOW.
          </p>
        </section>

        {EARN_PATHS.map((path) => (
          <EarnPathCard key={path.id} path={path} />
        ))}

        <StakingCalculatorCard />

        <section className="fb-surface p-4" data-testid="learn-bot-chain">
          <p className="fb-eyebrow text-primary">Why this helps BOT Chain</p>
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            FlowBridge does not claim that every tap grows an ecosystem. The honest connection is
            narrow and checkable: the swaps, bridges, claims and stakes you confirm are real
            transactions that settle on BOT Chain and can be inspected on the explorer, and campaigns
            and partner discovery introduce real users to real ecosystem products.
          </p>
        </section>

        <BottomNav />
      </main>
    </div>
  );
}

function EarnPathCard({ path }: { path: EarnPath }) {
  return (
    <section className="fb-surface overflow-hidden" data-testid={`earn-path-${path.id}`}>
      <div className="flex items-start justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <p className="fb-eyebrow flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5 text-primary" />
            {path.title}
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{path.summary}</p>
        </div>
        <StatusChip status={path.badge} />
      </div>

      <div className="space-y-3 p-3.5 sm:p-4">
        <Block label="What is this?" body={path.what} />
        <List label="How can I earn?" lines={path.how} />
        <details className="rounded-2xl border border-hairline p-3">
          <summary className="cursor-pointer font-mono text-[10px] font-black uppercase tracking-[0.1em] text-muted">
            Rules & what could change
          </summary>
          <div className="mt-2 space-y-3">
            <List label="Rules" lines={path.rules} />
            <List label="What could change" lines={path.couldChange} />
            <Block label="What do I confirm?" body={path.confirm} />
            <p className="font-mono text-[9px] font-black uppercase tracking-[0.12em] text-muted-soft">
              Source · {path.source}
            </p>
          </div>
        </details>

        {path.whyBotChain && (
          <div className="rounded-2xl border border-primary/25 bg-primary/8 p-3">
            <p className="fb-eyebrow text-primary">Why this helps BOT Chain</p>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">{path.whyBotChain}</p>
          </div>
        )}

        <Link
          to={path.href}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 font-mono text-[10.5px] font-black uppercase tracking-[0.1em] text-primary-foreground"
        >
          {path.ctaLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}

function Block({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <p className="fb-eyebrow">{label}</p>
      <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{body}</p>
    </div>
  );
}

function List({ label, lines }: { label: string; lines: readonly string[] }) {
  return (
    <div>
      <p className="fb-eyebrow">{label}</p>
      <ul className="mt-1 space-y-1.5">
        {lines.map((l) => (
          <li key={l} className="flex gap-2 text-[11.5px] leading-relaxed text-muted-soft">
            <span aria-hidden className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-primary" />
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}
