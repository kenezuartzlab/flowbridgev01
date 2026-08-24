/**
 * FlowBridge V27 §4/§5/§10 — animated first-time onboarding.
 *
 * Presentation only. Every control either advances a step, skips, or navigates to
 * an existing product surface. Nothing here approves, signs, claims, stakes,
 * swaps, bridges, or shows a balance or a reward number.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeftRight, ArrowRight, Coins, Sparkles, X } from "lucide-react";
import {
  ONBOARDING_CAPABILITIES,
  ONBOARDING_STEPS,
  nextOnboardingStepId,
  onboardingPercent,
  onboardingStep,
  type OnboardingStepId,
} from "@/lib/growth/onboarding";
import {
  completeOnboarding,
  markOnboardingStep,
  readOnboardingState,
  shouldAutoOpenOnboarding,
  skipOnboarding,
} from "@/lib/growth/onboardingState";

const CAP_ICON = {
  TRADE_BRIDGE: ArrowLeftRight,
  EARN_STAKE: Coins,
  FLOW_AI: Sparkles,
} as const;

export function OnboardingOverlay({
  forceOpen = false,
  onClose,
}: {
  /** Set when reopened explicitly from Learn/Help. */
  forceOpen?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [stepId, setStepId] = useState<OnboardingStepId>("WELCOME");
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (forceOpen) {
      setStepId("WELCOME");
      setOpen(true);
      return;
    }
    if (shouldAutoOpenOnboarding(readOnboardingState())) setOpen(true);
  }, [forceOpen]);

  useEffect(() => {
    if (!open) return;
    setEntered(false);
    const t = window.setTimeout(() => setEntered(true), 20);
    markOnboardingStep(stepId);
    return () => window.clearTimeout(t);
  }, [open, stepId]);

  const close = useCallback(
    (mode: "skip" | "done") => {
      if (mode === "skip") skipOnboarding();
      else completeOnboarding();
      setOpen(false);
      onClose?.();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close("skip");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  const step = useMemo(() => onboardingStep(stepId), [stepId]);
  const percent = onboardingPercent(stepId);
  const next = nextOnboardingStepId(stepId);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-background/80 p-3 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to FlowBridge"
      data-testid="onboarding-overlay"
    >
      <div
        className={`w-full max-w-md overflow-hidden rounded-3xl border border-hairline bg-card shadow-[0_30px_80px_-20px_rgba(0,0,0,0.75)] transition-all duration-300 ${
          entered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        }`}
      >
        {/* Progress — animation communicates progress, not decoration. */}
        <div className="h-1 w-full bg-foreground/8">
          <div
            className="h-1 bg-primary transition-[width] duration-500 ease-out"
            style={{ width: `${percent}%` }}
            data-testid="onboarding-progress"
          />
        </div>

        <div className="flex items-center justify-between gap-2 px-4 pt-3.5">
          <p className="fb-eyebrow" data-testid="onboarding-eyebrow">
            {step.eyebrow} · step {step.index + 1} of {ONBOARDING_STEPS.length}
          </p>
          <button
            type="button"
            onClick={() => close("skip")}
            aria-label="Skip onboarding"
            data-testid="onboarding-skip"
            className="grid h-7 w-7 place-items-center rounded-xl border border-hairline text-muted transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div key={stepId} className="fb-onboard-step px-4 pb-4 pt-2">
          <h2 className="text-[19px] font-black leading-tight tracking-tight">{step.title}</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{step.message}</p>

          {step.points.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {step.points.map((p) => (
                <li key={p} className="flex gap-2 text-[11.5px] leading-relaxed text-muted-soft">
                  <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-primary" />
                  {p}
                </li>
              ))}
            </ul>
          )}

          {step.showsCapabilities && (
            <div className="mt-3.5 space-y-2">
              {ONBOARDING_CAPABILITIES.map((cap, i) => {
                const Icon = CAP_ICON[cap.id];
                return (
                  <Link
                    key={cap.id}
                    to={cap.href}
                    onClick={() => close("done")}
                    data-testid={`onboarding-capability-${cap.id}`}
                    className="fb-onboard-cap flex items-start gap-2.5 rounded-2xl border border-hairline p-3 transition-colors hover:border-primary/40"
                    style={{ animationDelay: `${80 * i}ms` }}
                  >
                    <Icon className="mt-[2px] h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block font-mono text-[10.5px] font-black uppercase tracking-[0.1em]">
                        {cap.label}
                      </span>
                      <span className="mt-1 block text-[11.5px] leading-relaxed text-muted">
                        {cap.body}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          )}

          {step.whyBotChain && (
            <div className="mt-3.5 rounded-2xl border border-primary/25 bg-primary/8 p-3">
              <p className="fb-eyebrow text-primary">Why this helps BOT Chain</p>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">{step.whyBotChain}</p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {next ? (
              <button
                type="button"
                onClick={() => setStepId(next)}
                data-testid="onboarding-next"
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 font-mono text-[11px] font-black uppercase tracking-[0.1em] text-primary-foreground"
              >
                {step.actionLabel}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <Link
                to={step.href ?? "/home"}
                onClick={() => close("done")}
                data-testid="onboarding-finish"
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 font-mono text-[11px] font-black uppercase tracking-[0.1em] text-primary-foreground"
              >
                {step.actionLabel}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
            <button
              type="button"
              onClick={() => close("skip")}
              className="rounded-xl border border-hairline px-3 py-2 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-muted transition-colors hover:text-foreground"
            >
              {next ? "Skip for now" : "Skip"}
            </button>
            {step.href && next && (
              <Link
                to={step.href}
                onClick={() => close("done")}
                className="rounded-xl px-2 py-2 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-primary"
              >
                Ways to earn
              </Link>
            )}
          </div>

          <p className="mt-3 text-[10px] leading-relaxed text-muted-soft">
            This walkthrough only explains and navigates. It never approves, signs, claims or stakes
            anything.
          </p>
        </div>
      </div>
    </div>
  );
}
