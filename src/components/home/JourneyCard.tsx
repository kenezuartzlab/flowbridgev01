/**
 * FlowBridge V26 §7/§8/§10 — the guided journey surface on Home.
 *
 * Presentation only. It renders ONE primary stage card with ONE dominant CTA
 * (mobile: above the fold) plus at most one secondary discovery path. It exposes
 * no Approve / Claim / Stake / Swap / Bridge control: every CTA is a link into an
 * existing product surface that owns its own authorization. Skip / dismiss /
 * snooze are presentation-only and never change canonical state.
 */
import { useEffect } from "react";
import { Compass, ChevronDown, Route as RouteIcon, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { StatusChip } from "@/components/ai/StatusChip";
import { useJourney } from "@/lib/ai/journey/useJourney";
import { trackJourney } from "@/lib/ai/journey/journeyAnalytics";
import type { ResolvedJourney } from "@/lib/ai/journey/journeyTypes";

const CHIP: Record<string, "VERIFIED" | "PREVIEW" | "WAITING_FOR_USER" | "VERIFYING" | "COMPLETED"> =
  {
    EXPLORE: "PREVIEW",
    READY: "VERIFIED",
    NEEDS_YOU: "WAITING_FOR_USER",
    VERIFYING: "VERIFYING",
    COMPLETED: "COMPLETED",
  };

export function JourneyCard() {
  const { journey, secondary, selection, loading, dismiss, snooze } = useJourney();

  useEffect(() => {
    if (!journey) return;
    trackJourney("JOURNEY_SHOWN", journey.journeyId);
    trackJourney("JOURNEY_STAGE_SHOWN", journey.journeyId, {
      stageId: journey.currentStageId,
      stageStatus: journey.currentStatus,
    });
  }, [journey?.journeyId, journey?.currentStageId]);

  if (loading) {
    return (
      <section className="fb-surface p-4" data-testid="journey-loading">
        <div className="fb-inset h-14 animate-pulse" />
      </section>
    );
  }

  /** §6 — nothing useful is eligible: offer exploration, never a fake journey. */
  if (!journey) {
    return (
      <section className="fb-surface overflow-hidden" data-testid="journey-explore">
        <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
          <Compass className="h-3.5 w-3.5 text-primary" />
          <p className="fb-eyebrow">Explore FlowBridge</p>
        </div>
        <p className="px-4 pt-3 font-mono text-[10.5px] leading-relaxed text-muted">
          No guided journey applies to your account right now. Trading, markets and campaigns are
          open, and Flow AI can answer questions any time.
        </p>
        <div className="flex flex-wrap gap-2 p-3.5 sm:p-4">
          <Link
            to="/markets"
            className="rounded-xl border border-hairline px-3.5 py-2 font-mono text-[10.5px] font-black uppercase tracking-[0.1em] text-muted"
          >
            Markets
          </Link>
          <Link
            to="/assistant"
            className="rounded-xl border border-primary/40 bg-primary/10 px-3.5 py-2 font-mono text-[10.5px] font-black uppercase tracking-[0.1em] text-primary"
          >
            Ask Flow AI
          </Link>
        </div>
      </section>
    );
  }

  const stage =
    journey.stages.find((s) => s.id === journey.currentStageId) ?? journey.stages[0]!;

  const cta = (j: ResolvedJourney, dominant: boolean) => (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Link
        to={j.primaryCta.href}
        onClick={() =>
          trackJourney("JOURNEY_CTA_CLICKED", j.journeyId, {
            stageId: j.currentStageId,
            destination: j.primaryCta.href,
          })
        }
        data-testid={dominant ? "journey-primary-cta" : "journey-secondary-cta"}
        className={`rounded-xl bg-primary font-mono font-black uppercase tracking-[0.1em] text-primary-foreground ${dominant ? "px-4 py-2 text-[11px]" : "px-3 py-1.5 text-[10px]"}`}
      >
        {j.primaryCta.label}
      </Link>
      {j.secondaryCta && (
        <Link
          to={j.secondaryCta.href}
          onClick={() =>
            trackJourney("JOURNEY_CTA_CLICKED", j.journeyId, {
              stageId: j.currentStageId,
              destination: j.secondaryCta!.href,
            })
          }
          className="rounded-xl border border-hairline px-3 py-1.5 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-muted transition-colors hover:text-foreground"
        >
          {j.secondaryCta.label}
        </Link>
      )}
    </div>
  );

  return (
    <section className="fb-surface overflow-hidden" data-testid="journey-card">
      <div className="flex items-start justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <p className="fb-eyebrow flex items-center gap-1.5">
            <RouteIcon className="h-3.5 w-3.5 text-primary" />
            Guided journey
          </p>
          <p
            className="mt-1 font-mono text-[13px] font-black uppercase leading-snug tracking-[0.04em]"
            data-testid="journey-title"
          >
            {journey.title}
          </p>
          <p className="mt-1 font-mono text-[10px] leading-relaxed text-muted">{journey.summary}</p>
        </div>
        {!journey.urgent && (
          <button
            type="button"
            aria-label="Skip this journey"
            data-testid="journey-skip"
            onClick={() => {
              trackJourney("JOURNEY_DISMISSED", journey.journeyId);
              dismiss(journey.journeyId);
            }}
            className="shrink-0 rounded-lg p-1 text-muted transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* One primary stage card, one CTA — mobile above the fold. */}
      <div className="border-b border-hairline bg-primary/[0.04] px-3.5 py-3.5 sm:px-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusChip status={CHIP[stage.status] ?? "PREVIEW"} label={stage.label} />
          <span
            data-testid="journey-progress"
            className="rounded-md bg-foreground/6 px-1.5 py-0.5 font-mono text-[9px] font-black uppercase tracking-[0.08em] text-muted"
          >
            Step {journey.completedStages + 1} of {journey.totalStages}
          </span>
        </div>
        <p
          className="mt-2 font-mono text-[12.5px] font-black uppercase leading-snug tracking-[0.05em]"
          data-testid="journey-stage-title"
        >
          {stage.title}
        </p>
        <p className="mt-1 font-mono text-[10.5px] leading-relaxed text-muted">{stage.body}</p>
        {cta(journey, true)}
      </div>

      {/* Full stage list + evidence source stay behind details (§7). */}
      <details className="group border-b border-hairline px-4 py-2.5">
        <summary className="flex cursor-pointer list-none items-center gap-1 font-mono text-[9.5px] font-black uppercase tracking-[0.1em] text-primary">
          All steps
          <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
        </summary>
        <ul className="mt-2 space-y-2">
          {journey.stages.map((s) => (
            <li key={s.id} className="flex items-start gap-2">
              <StatusChip status={CHIP[s.status] ?? "PREVIEW"} label={s.label} />
              <div className="min-w-0">
                <p className="font-mono text-[10.5px] font-black uppercase tracking-[0.05em]">
                  {s.title}
                </p>
                <p className="font-mono text-[9.5px] leading-relaxed text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-2.5 font-mono text-[9px] leading-relaxed text-muted">
          How this is proven: {journey.completionEvidence}
        </p>
        {!journey.urgent && (
          <button
            type="button"
            onClick={() => {
              trackJourney("JOURNEY_SNOOZED", journey.journeyId);
              snooze(journey.journeyId);
            }}
            className="mt-2 rounded-xl border border-hairline px-3 py-1.5 font-mono text-[9.5px] font-black uppercase tracking-[0.1em] text-muted"
          >
            Remind me later
          </button>
        )}
      </details>

      {/* At most one secondary discovery path, deliberately quieter. */}
      {secondary && (
        <div className="px-4 py-3" data-testid="journey-secondary">
          <p className="font-mono text-[9px] font-black uppercase tracking-[0.12em] text-muted">
            Also worth exploring
          </p>
          <p className="mt-1 font-mono text-[11px] font-black uppercase tracking-[0.05em]">
            {secondary.title}
          </p>
          <p className="mt-1 font-mono text-[9.5px] leading-relaxed text-muted">
            {secondary.summary}
          </p>
          {cta(secondary, false)}
        </div>
      )}

      {selection.hiddenByUser.length > 0 && (
        <p className="border-t border-hairline px-4 py-2 font-mono text-[9px] leading-relaxed text-muted">
          {selection.hiddenByUser.length} journey
          {selection.hiddenByUser.length === 1 ? "" : "s"} hidden by you. Your rewards, staking and
          mission state are unchanged.
        </p>
      )}
    </section>
  );
}
