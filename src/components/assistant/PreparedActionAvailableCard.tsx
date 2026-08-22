import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import {
  preparedHandleUsable,
  STRUCTURED_ACTION_TESTIDS,
} from "@/lib/ai/actionRender";
import { parseHandoffHint, type HandoffHint } from "@/lib/ai/intentHandoff";
import { useConversation } from "@/lib/ai/conversationStore";

/**
 * V15.3H §4 — prepared-action discovery on Trade.
 *
 * A user who taps the bottom Trade nav (instead of the review CTA) arrives with
 * no intent in the URL. Rather than showing an empty form and letting Flow AI
 * claim a button exists, Trade surfaces the still-valid prepared plan from the
 * active session and lets the user apply it explicitly.
 *
 * It applies HINTS only: Trade re-resolves registry, balance, allowance, live
 * router fee and quote, and the user's own wallet remains the sole authority.
 */
export function PreparedActionAvailableCard({
  hasUrlHint,
  onApply,
}: {
  /** True when the CTA path already carried an intent in the URL. */
  hasUrlHint: boolean;
  onApply: (hint: HandoffHint) => void;
}) {
  const conversation = useConversation();
  const handle = conversation.prepared;

  if (hasUrlHint) return null;
  if (!preparedHandleUsable(handle)) return null;

  const href = handle!.handoffHref!;
  const [, query] = href.split("?");
  const hint = parseHandoffHint(query ?? "");
  if (!hint) return null;

  const seconds = Math.max(
    0,
    Math.round((new Date(handle!.expiresAt).getTime() - Date.now()) / 1000),
  );

  return (
    <section
      data-testid={STRUCTURED_ACTION_TESTIDS.preparedAvailable}
      className="fb-inset space-y-2 p-3"
      aria-live="polite"
    >
      <header className="flex items-center gap-2">
        <span
          aria-hidden
          className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary"
        >
          <Sparkles className="h-3 w-3" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="fb-eyebrow">Prepared action available</p>
          <p className="truncate font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">
            {handle!.type.replace(/_/g, " ")} · chain {handle!.chainId} · expires in {seconds}s
          </p>
        </div>
      </header>

      <p className="font-mono text-[10px] leading-relaxed text-muted">
        Flow AI prepared this plan in your current session. Applying it prefills the pair and amount
        here; Trade still rechecks route, balance, allowance, live fee, quote and simulation before
        your wallet can sign.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onApply(hint)}
          className="fb-glow inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-primary px-3 font-mono text-[10px] uppercase tracking-[0.06em] text-primary-foreground"
        >
          Apply prepared plan
        </button>
        <Link
          to="/assistant"
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-foreground/8 px-3 font-mono text-[10px] uppercase tracking-[0.06em] text-foreground"
        >
          Review in Flow AI
        </Link>
      </div>
    </section>
  );
}
