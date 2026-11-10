/**
 * FlowBridge V28 §5 — non-blocking post-swap/bridge account encouragement.
 *
 * Rendered AFTER the real transaction outcome, never instead of it. It offers one
 * CTA plus "Not now", respects a real cooldown, and stops asking once the account
 * is complete or the user has declined enough times.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { useAccountActivation } from "@/lib/growth/useAccountActivation";
import {
  ACTIVATION_PROMPT_COPY,
  shouldShowActivationPrompt,
} from "@/lib/growth/activationPrompt";
import {
  readActivationPromptState,
  recordActivationPromptDeclined,
  recordActivationPromptShown,
  recordActivationPromptStarted,
} from "@/lib/growth/activationPromptState";
import { trackActivation } from "@/lib/growth/activationAnalytics";
import { Button } from '@/components/ui/button';
import { usePersonalProgress } from '@/lib/rewards/usePersonalProgress';
import { resolveNextAction } from '@/lib/growth/nextAction';

export function PostActionActivationCard({
  outcomeSuccessful,
  onClose,
}: {
  outcomeSuccessful: boolean;
  onClose?: () => void;
}) {
  const { view, loading, signedIn, emailVerified, walletBound } = useAccountActivation();
  const [hidden, setHidden] = useState(false);
  const [decision] = useState(() => readActivationPromptState());
  const [recorded, setRecorded] = useState(false);
  const { data: personal } = usePersonalProgress(signedIn && outcomeSuccessful);

  const show =
    !loading &&
    !hidden &&
    shouldShowActivationPrompt({
      outcomeSuccessful,
      signedIn,
      emailVerified,
      walletBound,
      state: decision,
    }).show;

  useEffect(() => {
    if (!show || recorded) return;
    recordActivationPromptShown();
    trackActivation("ACTIVATION_PROMPT_SHOWN", { state: view.state });
    setRecorded(true);
  }, [show, recorded, view.state]);

  if (!show) {
    if (!outcomeSuccessful || loading || !signedIn || !emailVerified || !walletBound) return null;
    const next = personal?.nextBestAction;
    const fallback = resolveNextAction({signedIn, emailVerified, walletBound, confirmedTrades:1, liquidityPositions:0, activeStakes:0, activeCampaigns:0});
    return <div className="space-y-2 border-t border-hairline pt-3"><p className="text-xs text-muted">Your next action</p><Button asChild className="h-auto min-h-11 w-full whitespace-normal"><Link to={next?.destination ?? fallback.href} onClick={()=>onClose?.()}>{next?.label ?? fallback.label}<ArrowUpRight aria-hidden/></Link></Button><Button asChild variant="ghost" className="min-h-11"><Link to="/rewards" hash="referrals" onClick={()=>onClose?.()}>Invite a friend</Link></Button></div>;
  }

  const href = view.primary.href ?? "/rewards#bind";

  return (
    <div
      data-testid="post-action-activation"
      className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.04] p-3 text-left"
    >
      <p className="flex items-center gap-1.5 font-mono text-[9px] font-black uppercase tracking-[0.12em] text-muted">
        <ShieldCheck className="h-3 w-3 text-primary" />
        {ACTIVATION_PROMPT_COPY.eyebrow}
      </p>
      <p className="mt-1.5 text-[12.5px] font-bold text-foreground">{ACTIVATION_PROMPT_COPY.title}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted">
        {ACTIVATION_PROMPT_COPY.body}
      </p>
      <div className="mt-2.5 flex gap-2">
        <Button asChild className="h-auto min-h-11 flex-1 whitespace-normal"><Link
          to={href}
          data-testid="post-action-activation-cta"
          onClick={() => {
            recordActivationPromptStarted();
            trackActivation("VERIFY_STARTED", { from: "POST_ACTION" });
            onClose?.();
          }}
          className="flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-primary-foreground"
        >
          {ACTIVATION_PROMPT_COPY.ctaLabel}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link></Button>
        <Button variant="ghost"
          type="button"
          data-testid="post-action-activation-decline"
          onClick={() => {
            recordActivationPromptDeclined();
            trackActivation("ACTIVATION_PROMPT_DECLINED");
            setHidden(true);
          }}
          className="min-h-[38px] rounded-xl border border-foreground/10 px-3 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-muted"
        >
          {ACTIVATION_PROMPT_COPY.declineLabel}
        </Button>
      </div>
      <p className="mt-2 text-[9.5px] leading-relaxed text-muted/70">
        {ACTIVATION_PROMPT_COPY.note}
      </p>
    </div>
  );
}
