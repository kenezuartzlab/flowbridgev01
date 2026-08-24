/**
 * FlowBridge V29 §2/§5/§6 — the participation summary card.
 *
 * Shows only verified facts, one next step, and (when a real mechanism exists)
 * a plain-English explanation of how the activity supports BOT Chain. There is
 * deliberately no score, level, rank or percentile.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, Info, Sparkles } from "lucide-react";
import { StatusPill } from "@/components/ui-kit/primitives";
import type { ParticipationView } from "@/lib/identity/participationProfile";

export function ParticipationProfileCard({
  view,
  loading = false,
  className = "",
}: {
  view: ParticipationView;
  loading?: boolean;
  className?: string;
}) {
  if (loading) {
    return (
      <section className={`fb-surface p-4 ${className}`} aria-busy="true">
        <div className="h-3 w-28 animate-pulse rounded bg-muted/25" />
        <div className="mt-3 h-4 w-56 animate-pulse rounded bg-muted/20" />
        <div className="mt-2 h-3 w-full animate-pulse rounded bg-muted/15" />
      </section>
    );
  }

  return (
    <section className={`fb-surface p-4 ${className}`} data-fb-participation={view.stage}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={view.readiness.setupComplete ? "ok" : "pending"}>
          <BadgeCheck className="h-3 w-3" aria-hidden />
          {view.stageLabel}
        </StatusPill>
        <span className="text-[11px] text-muted">{view.summaryNote}</span>
      </div>

      <h2 className="mt-3 text-[17px] font-black leading-tight tracking-[-0.01em]">
        {view.headline}
      </h2>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{view.message}</p>

      {view.tags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {view.tags.map((t) => (
            <li key={t.id}>
              <span
                title={t.evidence}
                className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary"
              >
                <Sparkles className="h-3 w-3" aria-hidden />
                {t.label}
              </span>
            </li>
          ))}
        </ul>
      )}

      {view.stats.length > 0 ? (
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {view.stats.map((s) => (
            <div key={s.id} className="rounded-[var(--fb-radius-md)] border border-hairline p-2.5">
              <dt className="text-[10.5px] font-bold uppercase tracking-wide text-muted">
                {s.label}
              </dt>
              <dd className="mt-0.5 text-[15px] font-black tabular-nums">{s.value}</dd>
              <p className="mt-0.5 text-[10px] text-muted">{s.source}</p>
            </div>
          ))}
        </dl>
      ) : (
        view.emptyNote && (
          <p className="mt-3 rounded-[var(--fb-radius-md)] border border-hairline p-2.5 text-[12px] text-muted">
            {view.emptyNote}
          </p>
        )
      )}

      {view.whyBotChain && (
        <p className="mt-3 flex gap-2 rounded-[var(--fb-radius-md)] border border-hairline bg-card/60 p-2.5 text-[11.5px] leading-relaxed text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{view.whyBotChain}</span>
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          to={view.nextStep.href}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-[var(--fb-radius-md)] bg-primary px-3.5 text-[12.5px] font-bold text-primary-foreground transition-opacity hover:opacity-90"
        >
          {view.nextStep.label}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        <span className="text-[11.5px] text-muted">{view.nextStep.body}</span>
      </div>

      {view.nextStep.requiresWalletConfirmation && (
        <p className="mt-2 text-[11px] text-muted">
          Any on-chain step is still confirmed by you in your own wallet.
        </p>
      )}
    </section>
  );
}
