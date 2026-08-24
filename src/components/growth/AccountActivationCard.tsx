/**
 * FlowBridge V28 §3/§4 — the "Complete your FlowBridge account" card.
 *
 * Presentation only: one value message first, one primary action at a time,
 * calm progress feedback. It creates no mission, no prepared action and no
 * reward, and it never says swapping or bridging requires verification.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  BadgeCheck,
  Check,
  ChevronDown,
  Loader2,
  Mail,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useAccountActivation } from "@/lib/growth/useAccountActivation";
import { trackActivation } from "@/lib/growth/activationAnalytics";
import { botChainImpact } from "@/lib/growth/botChainImpact";
import type { ActivationStepId } from "@/lib/growth/accountActivation";

const STEP_ICON: Record<ActivationStepId, typeof Mail> = {
  VERIFY_EMAIL: Mail,
  BIND_WALLET: Wallet,
  EXPLORE_BENEFITS: BadgeCheck,
};

export function AccountActivationCard() {
  const { view, loading, email, sendVerificationEmail, refresh } = useAccountActivation();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showBenefits, setShowBenefits] = useState(false);

  useEffect(() => {
    if (loading) return;
    trackActivation("ACTIVATION_CARD_SHOWN", { state: view.state, completed: view.completed });
    if (view.accountComplete) trackActivation("ACTIVATION_COMPLETED_OBSERVED");
  }, [loading, view.state, view.completed, view.accountComplete]);

  if (loading) {
    return (
      <section className="fb-surface p-4" data-testid="activation-loading">
        <div className="fb-inset h-14 animate-pulse" />
      </section>
    );
  }

  const onVerify = async () => {
    setBusy(true);
    setMessage(null);
    const res = await sendVerificationEmail();
    setMessage(
      res.ok
        ? `Verification email sent${email ? ` to ${email}` : ""}. Open it, then tap "I've verified".`
        : (res.error ?? "Could not send the verification email."),
    );
    setBusy(false);
  };

  const primary = view.primary;

  return (
    <section
      className="fb-surface overflow-hidden"
      data-testid="activation-card"
      data-activation-state={view.state}
    >
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-3">
        <p className="fb-eyebrow flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          Your FlowBridge account
        </p>
        <span
          className="font-mono text-[10px] font-black uppercase tracking-[0.08em] tabular-nums text-muted"
          data-testid="activation-progress"
        >
          {view.completed} of {view.total} complete
        </span>
      </div>

      <div className="px-4 pt-3.5">
        <h2 className="text-[14px] font-bold leading-snug text-foreground">{view.headline}</h2>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">{view.message}</p>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-hairline">
          <div
            className="h-full rounded-full bg-primary transition-all duration-700"
            style={{ width: `${view.percent}%` }}
          />
        </div>

        <ol className="mt-3 space-y-2">
          {view.steps.map((s) => {
            const Icon = STEP_ICON[s.id];
            return (
              <li
                key={s.id}
                data-testid={`activation-step-${s.id}`}
                data-done={s.done ? "true" : "false"}
                className="fb-onboard-cap flex items-start gap-2.5"
              >
                <span
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg border ${
                    s.done
                      ? "border-success/40 bg-success/10 text-success"
                      : "border-hairline text-muted"
                  }`}
                >
                  {s.done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-bold text-foreground">{s.title}</span>
                  <span className="block text-[11px] leading-relaxed text-muted">{s.body}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* One primary action at a time (V28 §3). */}
      <div className="space-y-2 p-3.5 sm:p-4">
        {primary.kind === "SEND_VERIFICATION_EMAIL" ? (
          <>
            <button
              type="button"
              onClick={onVerify}
              disabled={busy}
              data-testid="activation-primary"
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-primary/45 bg-primary/12 px-3 font-mono text-[11px] font-black uppercase tracking-[0.1em] text-primary disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              {primary.label}
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              data-testid="activation-recheck"
              className="min-h-[38px] w-full rounded-xl border border-hairline px-3 font-mono text-[10.5px] font-black uppercase tracking-[0.1em] text-muted"
            >
              I've verified — refresh
            </button>
          </>
        ) : (
          <Link
            to={primary.href ?? "/"}
            data-testid="activation-primary"
            onClick={() =>
              trackActivation(
                primary.kind === "BIND_WALLET" ? "WALLET_BINDING_STARTED" : "ACTIVATION_CARD_SHOWN",
                { state: view.state },
              )
            }
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-primary/45 bg-primary/12 px-3 font-mono text-[11px] font-black uppercase tracking-[0.1em] text-primary"
          >
            {primary.label}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        )}

        {message && (
          <p className="fb-inset px-3 py-2 font-mono text-[10px] leading-relaxed text-muted" data-testid="activation-message">
            {message}
          </p>
        )}

        {view.secondary?.href && (
          <Link
            to={view.secondary.href}
            data-testid="activation-secondary"
            className="flex min-h-[38px] w-full items-center justify-center rounded-xl border border-hairline px-3 font-mono text-[10.5px] font-black uppercase tracking-[0.1em] text-muted"
          >
            {view.secondary.label}
          </Link>
        )}

        <button
          type="button"
          onClick={() => setShowBenefits((v) => !v)}
          data-testid="activation-benefits-toggle"
          className="flex min-h-[36px] w-full items-center justify-between gap-2 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-muted"
        >
          What this unlocks
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showBenefits ? "rotate-180" : ""}`} />
        </button>

        {showBenefits && (
          <ul className="space-y-2" data-testid="activation-benefits">
            {view.benefits.map((b) => (
              <li key={b.id} className="fb-inset px-3 py-2">
                <p className="text-[11.5px] font-bold text-foreground">{b.title}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{b.body}</p>
                <p className="mt-1 font-mono text-[9.5px] leading-relaxed text-muted/80">{b.limit}</p>
              </li>
            ))}
          </ul>
        )}

        <p className="font-mono text-[9.5px] leading-relaxed text-muted/80" data-testid="activation-truth">
          {view.truthNote}
        </p>
        <p className="font-mono text-[9.5px] leading-relaxed text-muted/80">
          Why this helps BOT Chain: {botChainImpact("ACCOUNT")}
        </p>
      </div>
    </section>
  );
}
