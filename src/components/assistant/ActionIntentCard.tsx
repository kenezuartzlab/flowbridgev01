import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Clock, ShieldCheck } from "lucide-react";
import type { ActionIntent, ActionHandoff } from "@/lib/ai/actionIntent";
import { ACTION_STATUS_COPY } from "@/lib/ai/actionIntent";
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
}: {
  payload: PreparedIntentPayload;
  /** V15.3H §3 — structured CTA descriptor. Preferred over the raw handoff href. */
  reviewAction?: ReviewAction | null;
}) {
  const { intent, handoff } = payload;
  const p = intent.parameters as Record<string, any>;
  const amountField = AMOUNT_FIELDS.find((f) => p[f] !== undefined);
  const ready = intent.status === "READY_FOR_USER";
  const expiresIn = Math.max(
    0,
    Math.round((new Date(intent.expiresAt).getTime() - Date.now()) / 1000),
  );

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
            {ACTION_STATUS_COPY[intent.status]} · policy {intent.policyVersion}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-md bg-foreground/6 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
          <Clock className="h-2.5 w-2.5" />
          {expiresIn}s
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
