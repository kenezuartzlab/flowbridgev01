import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Clock, ShieldCheck } from "lucide-react";
import type { ActionIntent, ActionHandoff } from "@/lib/ai/actionIntent";
import { ACTION_STATUS_COPY, effectiveStatus, secondsRemaining } from "@/lib/ai/actionIntent";
import { getConversation, markConversationHandoff } from "@/lib/ai/conversationStore";
import { STRUCTURED_ACTION_TESTIDS, type ReviewAction } from "@/lib/ai/actionRender";


export interface PreparedIntentPayload {
  intent: ActionIntent;
  /** V15.3E — live fee/quote/balance evidence read when the plan was prepared. */
  economics?: {
    feeBps: number | null;
    feeConfigNonce: string | null;
    feeSource: "ON_CHAIN" | "UNAVAILABLE";
    expectedOut: number | null;
    balance: number | null;
    allowance: number | null;
    observedAt: string;
  } | null;
  decision: string;
  blockers: string[];
  riskFlags: string[];
  missingEvidence: string[];
  handoff: ActionHandoff | null;
  executed: false;
}

const AMOUNT_FIELDS = ["amountIn", "amountFlow", "claimableFlow", "rewardAmount"] as const;

/**
 * V15.2 §5 — review card for a prepared action. Copy never implies execution:
 * Flow AI prepared and simulated it; the linked product surface revalidates and
 * the user's own wallet signs.
 */
export function ActionIntentCard({
  payload,
  reviewAction = null,
  correlation = null,
}: {
  payload: PreparedIntentPayload;
  /** V15.3H §3 — structured CTA descriptor. Preferred over the raw handoff href. */
  reviewAction?: ReviewAction | null;
  /**
   * V17.1C §2 — opaque mission correlation carried into the review surface so the
   * user's own submission can be reported back. Never economics, never authority.
   */
  correlation?: { missionId: string; stepId: string; intentId: string | null } | null;
}) {
  const { intent, handoff } = payload;

  const p = intent.parameters as Record<string, any>;
  const amountField = AMOUNT_FIELDS.find((f) => p[f] !== undefined);
  /**
   * V15.3K §3 — ONE expiry authority, ticking. The card derives status from
   * `effectiveStatus`, so the countdown and the badge can never disagree: at 0s
   * the badge reads EXPIRED and the review CTA is gone in the same render.
   */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(t);
  }, [intent.id]);
  const status = effectiveStatus(intent, new Date(now));
  const ready = status === "READY_FOR_USER";
  const expired = status === "EXPIRED";
  const expiresIn = secondsRemaining(intent, new Date(now));
  /** V15.3K §5 — the asset the user reviewed: native BOT stays native, WBOT stays wrapped. */
  const assetOut =
    p.tokenOutSymbol && typeof p.tokenOutSymbol === "string"
      ? `${p.tokenOutSymbol}${p.tokenOutIsNative ? " (native)" : ""}`
      : null;
  const assetIn =
    p.tokenInSymbol && typeof p.tokenInSymbol === "string"
      ? `${p.tokenInSymbol}${p.tokenInIsNative ? " (native)" : ""}`
      : null;
  /**
   * V15.3K §6 — approval honesty. When the live allowance read at preparation
   * time is below the amount, this action needs TWO wallet confirmations
   * (approve, then the action). The card says so instead of implying one.
   */
  const amountNumber = Number(p.amountIn ?? p.amountFlow ?? NaN);
  const needsApproval =
    payload.economics?.allowance !== null &&
    payload.economics?.allowance !== undefined &&
    Number.isFinite(amountNumber) &&
    payload.economics.allowance < amountNumber;

  /**
   * V15.3F §1 — the CTA must navigate IN-APP with its query hints intact.
   * A single `to="/trade?…"` string is treated as a path by the router, so the
   * hints never reached Trade and the form opened empty. Split path from search
   * and pass the search record, plus the conversation id for correlation.
   */
  const [fallbackPath, fallbackQuery] = (handoff?.href ?? "/trade").split("?");
  const handoffPath = reviewAction?.route ?? fallbackPath;
  const handoffSearch: Record<string, string> = {
    ...(reviewAction?.search ?? Object.fromEntries(new URLSearchParams(fallbackQuery ?? ""))),
  };
  handoffSearch.conv = getConversation().conversationId;
  const ctaLabel = reviewAction?.label ?? handoff?.cta ?? "Review in Trade";
  const ctaSurface = reviewAction?.surface ?? handoff?.surface ?? "Trade";


  return (
    <section
      data-testid={STRUCTURED_ACTION_TESTIDS.card}
      data-intent-id={intent.id}
      className="fb-inset space-y-2 p-3"
    >
      <header className="flex items-center gap-2">
        <span
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg ${
            ready ? "bg-primary/12 text-primary" : "bg-foreground/8 text-muted"
          }`}
          aria-hidden
        >
          {ready ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="fb-eyebrow">{intent.type.replace(/_/g, " ")}</p>
          <p className="truncate font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">
            {ACTION_STATUS_COPY[status]} · policy {intent.policyVersion}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-md bg-foreground/6 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
          <Clock className="h-2.5 w-2.5" />
          {expired ? "expired" : `${expiresIn}s`}
        </span>
      </header>

      <dl className="grid grid-cols-2 gap-1.5 font-mono text-[10px] text-muted">
        <div>
          <dt className="uppercase tracking-[0.06em]">Network</dt>
          <dd className="text-foreground">chain {intent.chainId}</dd>
        </div>
        {amountField ? (
          <div>
            <dt className="uppercase tracking-[0.06em]">Amount</dt>
            <dd className="text-foreground">{String(p[amountField])}</dd>
          </div>
        ) : null}
        {assetIn || assetOut ? (
          <div className="col-span-2 min-w-0">
            <dt className="uppercase tracking-[0.06em]">Asset</dt>
            <dd className="truncate text-foreground">
              {[assetIn, assetOut].filter(Boolean).join(" → ")}
            </dd>
          </div>
        ) : null}
        {intent.targetContract ? (
          <div className="col-span-2 min-w-0">
            <dt className="uppercase tracking-[0.06em]">Contract</dt>
            <dd className="truncate text-foreground">{intent.targetContract}</dd>
          </div>
        ) : null}
        {payload.economics ? (
          <>
            <div>
              <dt className="uppercase tracking-[0.06em]">Router fee (live)</dt>
              <dd className="text-foreground">
                {payload.economics.feeSource === "ON_CHAIN" && payload.economics.feeBps !== null
                  ? `${payload.economics.feeBps / 100}% · ${payload.economics.feeBps} bps`
                  : "unavailable — shown on /trade"}
              </dd>
            </div>
            {payload.economics.expectedOut !== null ? (
              <div>
                <dt className="uppercase tracking-[0.06em]">Expected out</dt>
                <dd className="text-foreground">{payload.economics.expectedOut}</dd>
              </div>
            ) : null}
            {payload.economics.balance !== null ? (
              <div>
                <dt className="uppercase tracking-[0.06em]">Balance</dt>
                <dd className="text-foreground">{payload.economics.balance}</dd>
              </div>
            ) : null}
            {payload.economics.feeConfigNonce ? (
              <div>
                <dt className="uppercase tracking-[0.06em]">Fee config nonce</dt>
                <dd className="text-foreground">{payload.economics.feeConfigNonce}</dd>
              </div>
            ) : null}
          </>
        ) : null}
        {intent.simulationResult ? (
          <div className="col-span-2">
            <dt className="uppercase tracking-[0.06em]">Simulation</dt>
            <dd className="text-foreground">
              {intent.simulationResult.ok ? "passed" : (intent.simulationResult.revertReason ?? "failed")} ·{" "}
              {intent.simulationResult.method}
            </dd>
          </div>
        ) : null}
      </dl>

      {payload.riskFlags.length > 0 ? (
        <ul className="space-y-0.5 font-mono text-[9.5px] leading-relaxed text-muted">
          {payload.riskFlags.map((r) => (
            <li key={r}>• {r}</li>
          ))}
        </ul>
      ) : null}

      {payload.blockers.length > 0 ? (
        <ul className="space-y-0.5 font-mono text-[9.5px] leading-relaxed text-danger">
          {payload.blockers.map((b) => (
            <li key={b}>• {b}</li>
          ))}
        </ul>
      ) : null}

      {ready && (reviewAction || handoff) ? (
        <Link
          to={handoffPath}
          search={handoffSearch as never}
          data-testid={STRUCTURED_ACTION_TESTIDS.cta}
          onClick={() => markConversationHandoff(intent.id)}
          className="fb-glow inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-center font-mono text-[10.5px] uppercase tracking-[0.06em] text-primary-foreground"
        >
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          {ctaLabel}
        </Link>
      ) : null}

      {expired ? (
        <p className="font-mono text-[9.5px] leading-relaxed text-danger">
          This plan expired, so it is no longer reviewable. Ask me to prepare it again and I will
          re-read the live fee, allowance, quote and simulation.
        </p>
      ) : null}

      {ready && needsApproval ? (
        <p className="font-mono text-[9.5px] leading-relaxed text-muted">
          Two wallet confirmations: first an approval for this token, then the action itself.
        </p>
      ) : null}

      <p className="font-mono text-[9px] leading-relaxed text-muted">
        Prepared and simulated only — nothing was signed or submitted, and no chat confirmation is
        needed or possible.{" "}
        {handoff || reviewAction
          ? `${ctaSurface} prefills these values, then rechecks fee, allowance, quote and simulation before your wallet can confirm.`
          : ""}
      </p>

    </section>
  );
}
