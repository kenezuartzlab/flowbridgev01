import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ExternalLink, ShieldCheck } from "lucide-react";
import {
  evaluateHandoff,
  fingerprintDigest,
  handoffFingerprint,
  parseHandoffHint,
  readHandoffObservation,
  recordHandoffObservation,
  type HandoffEvaluation,
  type HandoffHint,
  type HandoffObservation,
} from "@/lib/ai/intentHandoff";
import { resolveCanonicalTargets, canonicalTargetFor } from "@/lib/ai/actionIntent";
import {
  HANDOFF_RESOLUTION_COPY,
  type HandoffResolutionStatus,
} from "@/lib/ai/handoffResolution";

/**
 * V15.3 §4/§5 — Trade-side handoff notice.
 *
 * The Trade surface never trusts a Flow AI simulation. This banner only reports
 * whether the linked hint is still fresh; the swap card independently
 * re-resolves route, balance, allowance and quote, and the user's own wallet is
 * the single execution authority.
 */
export function AiHandoffBanner({
  currentChainId,
  observedTxHash,
  txUrlPrefix,
  onSwitchChain,
  resolutionStatus = null,
  resolutionMessage = null,
}: {
  currentChainId: number | null;
  observedTxHash?: string | null;
  txUrlPrefix?: string;
  /**
   * V15.3J §3/§6 — server-resolved handoff outcome. When present it OUTRANKS the
   * local fingerprint check, because the opaque link no longer carries economic
   * fields for the client to recompute. Distinguishes MISSING / EXPIRED /
   * TAMPERED / UNAUTHENTICATED instead of collapsing them into "malformed".
   */
  resolutionStatus?: HandoffResolutionStatus | null;
  resolutionMessage?: string | null;
  /** V15.3B — user-initiated network switch to the immutable intent chain. */
  onSwitchChain?: (chainId: number) => void | Promise<void>;
}) {
  const [hint, setHint] = useState<HandoffHint | null>(null);
  const [observation, setObservation] = useState<HandoffObservation | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const parsed = parseHandoffHint(window.location.search);
    setHint(parsed);
    if (parsed) setObservation(recordHandoffObservation({ intentId: parsed.intentId }));
    const t = window.setInterval(() => setTick((n) => n + 1), 5_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!hint || !observedTxHash) return;
    setObservation(
      recordHandoffObservation({
        intentId: hint.intentId,
        observedTxHash,
        observedOutcome: "SUCCESS",
      }),
    );
  }, [hint, observedTxHash]);

  const evaluation: HandoffEvaluation | null = useMemo(() => {
    if (!hint) return null;
    void tick;
    const targets = resolveCanonicalTargets(hint.chainId);
    const target = targets ? canonicalTargetFor(hint.type as any, targets) : null;
    const recomputed = handoffFingerprint({
      type: hint.type,
      chainId: hint.chainId,
      targetContract: target,
      tokenIn: hint.hints.from ?? hint.hints.token ?? null,
      tokenOut: hint.hints.to ?? null,
      amount: hint.hints.amount ?? null,
      destinationChainId: hint.hints.dest ?? null,
    });
    return evaluateHandoff({ hint, recomputedFingerprint: recomputed, currentChainId });
  }, [hint, currentChainId, tick]);

  if (!hint || !evaluation) return null;
  // V15.3J — server authority first; fall back to the local freshness check only
  // while the resolution is still in flight (or for legacy hint-bearing links).
  const serverResolved = resolutionStatus !== null;
  const fresh = serverResolved
    ? resolutionStatus === "RESOLVED" && evaluation.verdict !== "CHAIN_MISMATCH"
    : evaluation.verdict === "FRESH";
  const statusLabel = (serverResolved ? resolutionStatus! : evaluation.verdict)
    .replace(/_/g, " ")
    .toLowerCase();
  const statusMessage =
    serverResolved && resolutionStatus !== "RESOLVED"
      ? (resolutionMessage ?? HANDOFF_RESOLUTION_COPY[resolutionStatus!])
      : evaluation.message;
  const stored = observation ?? readHandoffObservation(hint.intentId);

  return (
    <section
      className={`fb-inset space-y-2 p-3 ${fresh ? "" : "border border-danger/40"}`}
      aria-live="polite"
    >
      <header className="flex items-center gap-2">
        <span
          aria-hidden
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg ${
            fresh ? "bg-primary/12 text-primary" : "bg-danger/12 text-danger"
          }`}
        >
          {fresh ? <ShieldCheck className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="fb-eyebrow">Flow AI handoff</p>
          <p className="truncate font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">
            {hint.type.replace(/_/g, " ")} · intent {hint.intentId.slice(0, 10)} ·{" "}
            {statusLabel}
          </p>
        </div>
      </header>

      <p className="font-mono text-[10px] leading-relaxed text-muted">{statusMessage}</p>

      {evaluation.verdict === "CHAIN_MISMATCH" && onSwitchChain ? (
        <button
          type="button"
          onClick={() => void onSwitchChain(hint.chainId)}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-primary px-3 font-mono text-[10px] uppercase tracking-[0.06em] text-primary-foreground"
        >
          Switch to {hint.chainId === 968 ? "BOT Testnet" : hint.chainId === 677 ? "BOT Mainnet" : `chain ${hint.chainId}`}
        </button>
      ) : null}

      {!fresh ? (
        <Link
          to="/assistant"
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-foreground/8 px-3 font-mono text-[10px] uppercase tracking-[0.06em] text-foreground"
        >
          Ask Flow AI to prepare again
        </Link>
      ) : null}

      {stored?.observedTxHash ? (
        <p className="font-mono text-[9.5px] leading-relaxed text-muted">
          Observed transaction (submitted by your wallet, not by Flow AI):{" "}
          {txUrlPrefix ? (
            <a
              href={`${txUrlPrefix}${stored.observedTxHash}`}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 underline decoration-dotted"
            >
              {stored.observedTxHash.slice(0, 12)}…
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          ) : (
            `${stored.observedTxHash.slice(0, 12)}…`
          )}
        </p>
      ) : null}

      <p className="font-mono text-[9px] leading-relaxed text-muted">
        Prefilled values are hints only. Trade revalidates every value and only your wallet can
        authorize the transaction · digest {fingerprintDigest(hint.digest).slice(0, 6)}
      </p>
    </section>
  );
}
