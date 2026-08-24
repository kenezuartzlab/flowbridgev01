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

  if (!show) return null;

  const href = view.primary.href ?? "/rewards#bind";

  return (
    <div
      data-testid="post-action-activation"
      className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left"
    >
      <p className="flex items-center gap-1.5 font-mono text-[9px] font-black uppercase tracking-[0.12em] text-[#C5C1B9]">
        <ShieldCheck className="h-3 w-3 text-[#32FF8B]" />
        {ACTIVATION_PROMPT_COPY.eyebrow}
      </p>
      <p className="mt-1.5 text-[12.5px] font-bold text-white">{ACTIVATION_PROMPT_COPY.title}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-[#C5C1B9]">
        {ACTIVATION_PROMPT_COPY.body}
      </p>
      <div className="mt-2.5 flex gap-2">
        <Link
          to={href}
          data-testid="post-action-activation-cta"
          onClick={() => {
            recordActivationPromptStarted();
            trackActivation("VERIFY_STARTED", { from: "POST_ACTION" });
            onClose?.();
          }}
          className="flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#32FF8B] px-3 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-[#010C1B]"
        >
          {ACTIVATION_PROMPT_COPY.ctaLabel}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
        <button
          type="button"
          data-testid="post-action-activation-decline"
          onClick={() => {
            recordActivationPromptDeclined();
            trackActivation("ACTIVATION_PROMPT_DECLINED");
            setHidden(true);
          }}
          className="min-h-[38px] rounded-xl border border-white/10 px-3 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-[#C5C1B9]"
        >
          {ACTIVATION_PROMPT_COPY.declineLabel}
        </button>
      </div>
      <p className="mt-2 text-[9.5px] leading-relaxed text-[#C5C1B9]/70">
        {ACTIVATION_PROMPT_COPY.note}
      </p>
    </div>
  );
}
