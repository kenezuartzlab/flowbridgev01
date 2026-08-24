import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Bot, ChevronDown, RotateCcw, ShieldCheck, Sparkles, User, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { assistantFetch } from "@/lib/ai/assistantClient";
import { useJourney } from "@/lib/ai/journey/useJourney";
import { journeyContextLine, journeyPrompts } from "@/lib/ai/journey/journeyPrompts";

import { supabase } from "@/integrations/supabase/client";
import { AssistantMemoryPanel } from "./AssistantMemoryPanel";
import { ActionIntentCard, type PreparedIntentPayload } from "./ActionIntentCard";
import {
  clearConversationObservation,
  ensureConversationOwner,
  markConversationHandoff,
  pruneExpiredPreparation,
  resetConversation,
  setConversationActionSession,
  setConversationPreparationFailure,
  setConversationDraft,
  setConversationMessages,
  setConversationPending,
  setConversationPrepared,
  setConversationRenderStatus,
  updateConversationMessages,
  useConversation,
  type PendingPreparationRef,
  type PreparedHandleRef,
} from "@/lib/ai/conversationStore";

import type { ChatMessage, EvidenceRef } from "@/lib/ai/conversationTypes";
import type { ActionSession, PreparationFailure } from "@/lib/ai/actionSession";
import {
  RENDER_FAILED_MESSAGE,
  STRUCTURED_ACTION_TESTIDS,
  validateStructuredAction,
  type AssistantMode,
  type ReviewAction,
} from "@/lib/ai/actionRender";

export type { ChatMessage, EvidenceRef };

interface IntentProposalRef {
  type: string;
  chainId: number;
  parameters: Record<string, unknown>;
  recognized?: string[];
}




/**
 * Flow AI surface. Presentation + fetch only — it never touches swap/bridge
 * execution state, and every answer arrives with its evidence trail from
 * /api/assistant.
 *
 * V15.3F — the transcript, pending slot and prepared review card live in the
 * module-scope conversation store, so Assistant → Trade → Home → Assistant
 * restores the same conversation instead of mounting an empty chat.
 */
/**
 * V15.3B — reads the browser wallet's current address and chain as HINTS only.
 * Read-only: it never prompts a connection, and the server treats these values
 * as untrusted (binding itself is a persisted account fact).
 */
async function readConnectorHint(): Promise<{ address: string | null; chainId: number | null }> {
  try {
    const eth = (globalThis as any)?.ethereum;
    if (!eth?.request) return { address: null, chainId: null };
    const accounts: string[] = await eth.request({ method: "eth_accounts" });
    const hex: string = await eth.request({ method: "eth_chainId" });
    return {
      address: accounts?.[0] ? String(accounts[0]).toLowerCase() : null,
      chainId: Number.parseInt(hex, 16) || null,
    };
  } catch {
    return { address: null, chainId: null };
  }
}

export function AssistantChat({ onHide }: { onHide?: () => void } = {}) {
  const conversation = useConversation();
  const messages = conversation.messages;
  const pending = conversation.pending;
  const preparedHandle = conversation.prepared;
  /**
   * V15.3G §5 — the composer draft is session state, not component state, so an
   * unsent question survives Assistant → Trade → Assistant.
   */
  const input = conversation.composerDraft;
  const setInput = setConversationDraft;
  /**
   * V25 §4 / V26 §9 — quick prompts are derived from the user's REAL current
   * state and from the guided journey they are actually on, so the assistant
   * opens journey-aware instead of asking "how can I help?". They are prompts
   * only: nothing here prepares, signs or executes, and no prompt implies the
   * journey is mandatory.
   */
  const { decision, journey } = useJourney();
  const journeyLine = useMemo(() => journeyContextLine(journey), [journey]);
  const suggestions = useMemo(() => journeyPrompts({ journey, decision }), [journey, decision]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [openEvidence, setOpenEvidence] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  /**
   * Ownership gate: the transcript is scoped to the signed-in account. A
   * different account (or signing out) discards it rather than showing it.
   */
  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      ensureConversationOwner(data.user?.id ?? "anonymous");
      pruneExpiredPreparation();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      ensureConversationOwner(session?.user?.id ?? "anonymous");
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);


  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setError(null);
    setInput("");
    const next: ChatMessage[] = [...messages, { role: "user", content: question }];
    setConversationMessages([...next, { role: "assistant", content: "" }]);
    setBusy(true);

    try {
      const res = await assistantFetch("/api/assistant", {
        method: "POST",
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          pending,
          prepared: preparedHandle,
          // V15.3H §6 — report what the UI actually rendered / what Trade reported.
          productState: {
            renderStatus: conversation.renderStatus,
            hasPreparedHandle: Boolean(preparedHandle),
            handoff: conversation.observation
              ? {
                  code: conversation.observation.code,
                  surface: conversation.observation.surface,
                  detail: conversation.observation.detail,
                }
              : null,
          },
          // V15.3I §1/§2 — carry the canonical action session so a retry keeps
          // the user's explicit slots instead of re-asking for them.
          actionSession: conversation.actionSession,
          preparationFailure: conversation.preparationFailure,
          connector: await readConnectorHint(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        answer?: string;
        error?: string;
        mode?: string;
        confidenceLabel?: string;
        asOf?: string | null;
        notice?: string | null;
        skills?: string[];
        evidence?: EvidenceRef[];
        proposal?: IntentProposalRef | null;
        actionIntent?: Record<string, any> | null;
        actionPlan?: PreparedIntentPayload | null;
        reviewAction?: ReviewAction | null;
        notReadyReasons?: string[];
        pending?: PendingPreparationRef | null;
        actionPreparation?: boolean;
        hasLiveEvidence?: boolean;
        continuation?: { kind: string; keepPrepared: boolean } | null;
        actionSession?: ActionSession | null;
        preparationFailure?: PreparationFailure | null;
      };
      if (!res.ok || !data.answer) {
        throw new Error(data.error ?? "Flow AI is unavailable right now.");
      }

      /**
       * V15.3H §2 — the CARD comes from the structured payload, never from the
       * prose. The same validator the server used runs here too: a
       * READY_FOR_USER answer without a valid intent + reviewAction is treated
       * as a render failure, not narrated as if a button existed.
       */
      const mode = (data.mode ?? "INFO") as AssistantMode;
      const verdict = validateStructuredAction({
        mode,
        actionIntent: data.actionIntent ?? null,
        reviewAction: data.reviewAction ?? null,
      });
      const ready = mode === "READY_FOR_USER" && verdict.ok && Boolean(data.actionPlan);
      const renderFailed = mode === "READY_FOR_USER" && !ready;

      updateConversationMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: "assistant",
          content: renderFailed ? RENDER_FAILED_MESSAGE : data.answer!,
          mode: renderFailed ? "NOT_READY" : mode,
          confidenceLabel: data.confidenceLabel,
          asOf: data.asOf ?? null,
          notice: data.notice ?? null,
          skills: data.skills ?? [],
          evidence: data.evidence ?? [],
          hasLiveEvidence: data.hasLiveEvidence ?? false,
          actionPreparation: data.actionPreparation ?? false,
          prepared: ready ? (data.actionPlan as PreparedIntentPayload) : null,
          reviewAction: ready ? (data.reviewAction ?? null) : null,
          renderFailed,
          preparationFailure: ready ? null : (data.preparationFailure ?? null),
          preparationError:
            !ready && (data.notReadyReasons?.length ?? 0) > 0
              ? `Not prepared: ${data.notReadyReasons!.join("; ")}. Nothing was signed or submitted.`
              : null,
        };
        return copy;
      });

      setConversationPending(data.pending ?? null);
      // V15.3I §1/§3 — durable slots + machine-readable failure state.
      setConversationActionSession(data.actionSession ?? null);
      setConversationPreparationFailure(ready ? null : (data.preparationFailure ?? null));

      // V15.3D — a continuation turn either keeps the prepared plan alive or
      // retires it. Either way it never re-prepares silently.
      if (data.continuation && !data.continuation.keepPrepared) setConversationPrepared(null);

      if (ready) {
        const intent = data.actionPlan!.intent;
        setConversationPrepared({
          intentId: intent.id,
          type: intent.type,
          chainId: intent.chainId,
          state: intent.status,
          expiresAt: intent.expiresAt,
          handoffHref: data.actionPlan!.handoff?.href ?? null,
          handoffCta: data.reviewAction?.label ?? null,
          surface: data.reviewAction?.surface ?? null,
          actorKey: "",
        });
        setConversationRenderStatus("RENDERED");
      } else if (renderFailed) {
        setConversationPrepared(null);
        setConversationRenderStatus("RENDER_FAILED");
      } else if (mode !== "PREPARATION") {
        setConversationRenderStatus("NONE");
      }

    } catch (e: any) {
      updateConversationMessages((prev) => prev.slice(0, -1));
      setError(e?.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <section className="fb-surface flex min-h-[52vh] flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="fb-eyebrow">Flow AI</p>
            <p className="truncate font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">
              Evidence-grounded · prepares actions · never signs
            </p>
          </div>
          {/*
            V15.3I §6 — New chat is the ONLY destructive control; Hide never
            deletes the transcript, draft or prepared action.
          */}
          <button
            type="button"
            onClick={() => resetConversation()}
            aria-label="Start a new conversation"
            title="New chat"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:text-foreground"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          {onHide ? (
            <button
              type="button"
              onClick={onHide}
              aria-label="Hide Flow AI"
              title="Hide"
              data-testid="ai-hide"
              className="fb-inset grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
          {messages.length === 0 ? (
            <div className="space-y-3">
              <p className="font-mono text-[11px] leading-relaxed text-muted">
                Ask about your rewards, a transaction, staking, campaigns or BOT Chain. Flow AI
                answers from your FlowBridge data and on-chain evidence — it can explain and
                prepare, but it never signs or submits anything.
              </p>
              {/* V26 §9 — where you are, stated plainly. Never "you must". */}
              {journeyLine && (
                <p
                  data-testid="assistant-journey-context"
                  className="font-mono text-[10px] leading-relaxed text-primary"
                >
                  You're on: {journeyLine}
                </p>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="fb-inset min-h-[44px] px-3 py-2 text-left font-mono text-[10.5px] leading-snug text-muted transition-colors hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <span
                  aria-hidden
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg ${
                    m.role === "user"
                      ? "bg-foreground/8 text-muted"
                      : "bg-primary/12 text-primary"
                  }`}
                >
                  {m.role === "user" ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                </span>
                <div className="max-w-[85%] space-y-1.5">
                  <div
                    className={`whitespace-pre-wrap rounded-xl px-3 py-2 text-[12.5px] leading-relaxed ${
                      m.role === "user"
                        ? "bg-primary/12 text-foreground"
                        : "fb-inset text-foreground"
                    }`}
                  >
                    {m.content ||
                      (busy && i === messages.length - 1 ? (
                        <span className="font-mono text-[10.5px] text-muted">
                          Gathering evidence…
                        </span>
                      ) : null)}
                  </div>

                  {m.role === "assistant" && m.content ? (
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {m.confidenceLabel ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-foreground/6 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
                            <ShieldCheck className="h-2.5 w-2.5" />
                            {m.confidenceLabel}
                          </span>
                        ) : null}
                        {m.mode ? (
                          <span className="rounded-md bg-foreground/6 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
                            {m.mode}
                          </span>
                        ) : null}
                        {m.hasLiveEvidence ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-primary/12 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-primary">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
                            live
                          </span>
                        ) : m.asOf ? (
                          <span className="rounded-md bg-foreground/6 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
                            cached · as of {new Date(m.asOf).toLocaleString()}
                          </span>
                        ) : null}
                        {m.actionPreparation ? (
                          <span className="rounded-md bg-foreground/6 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
                            preparation
                          </span>
                        ) : null}
                      </div>

                      {m.evidence && m.evidence.length > 0 ? (
                        <div>
                          <button
                            type="button"
                            onClick={() => setOpenEvidence(openEvidence === i ? null : i)}
                            aria-expanded={openEvidence === i}
                            className="inline-flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted transition-colors hover:text-foreground"
                          >
                            <ChevronDown
                              className={`h-3 w-3 transition-transform ${openEvidence === i ? "rotate-180" : ""}`}
                            />
                            {m.evidence.length} source{m.evidence.length === 1 ? "" : "s"}
                          </button>
                          {openEvidence === i ? (
                            <ul className="fb-inset mt-1.5 space-y-2 p-2.5">
                              {m.evidence.map((e) => (
                                <li key={e.id} className="space-y-0.5">
                                  <p className="font-mono text-[9.5px] uppercase tracking-[0.06em] text-primary">
                                    {e.group} · {e.liveness === "LIVE" ? "live" : "cached"}
                                    {e.liveness === "LIVE"
                                      ? ""
                                      : ` · as of ${new Date(e.fetchedAt ?? e.observedAt).toLocaleString()}`}
                                  </p>
                                  <p className="text-[11px] leading-snug text-foreground">
                                    {e.url ? (
                                      <a
                                        href={e.url}
                                        target="_blank"
                                        rel="noreferrer noopener"
                                        className="underline decoration-dotted"
                                      >
                                        {e.label}
                                      </a>
                                    ) : (
                                      e.label
                                    )}
                                  </p>
                                  {e.excerpt ? (
                                    <p className="font-mono text-[9.5px] leading-relaxed text-muted">
                                      {e.excerpt}
                                    </p>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : null}

                      {m.prepared ? (
                        <ActionIntentCard payload={m.prepared} reviewAction={m.reviewAction ?? null} />
                      ) : null}
                      {m.renderFailed ? (
                        <div
                          data-testid={STRUCTURED_ACTION_TESTIDS.renderFailed}
                          className="fb-inset space-y-2 border border-danger/40 p-3"
                        >
                          <p className="fb-eyebrow text-danger">HANDOFF_RENDER_FAILED</p>
                          <p className="font-mono text-[10px] leading-relaxed text-muted">
                            The prepared plan did not arrive in a renderable form, so there is no
                            review card and no button to tap.
                          </p>
                          <button
                            type="button"
                            onClick={() => void send("Retry preparation.")}
                            className="fb-inset min-h-[36px] px-2.5 font-mono text-[9.5px] uppercase tracking-[0.06em] text-foreground"
                          >
                            Retry preparation
                          </button>
                        </div>
                      ) : null}
                      {m.preparationFailure ? (
                        <div
                          data-testid="ai-preparation-error"
                          className="fb-inset space-y-2 border border-danger/40 p-3"
                        >
                          <p className="fb-eyebrow text-danger">
                            {m.preparationFailure.errorCode} · stage {m.preparationFailure.stage}
                          </p>
                          <p className="font-mono text-[10px] leading-relaxed text-muted">
                            {m.preparationFailure.detail}. Nothing was signed or submitted.
                          </p>
                          {m.preparationFailure.retainedSlots.length > 0 ? (
                            <p className="font-mono text-[9.5px] leading-relaxed text-muted">
                              Kept: {m.preparationFailure.retainedSlots.join(" · ")}
                            </p>
                          ) : null}
                          <div className="flex flex-wrap items-center gap-2">
                            {m.preparationFailure.retryable ? (
                              <button
                                type="button"
                                data-testid="ai-retry-preparation"
                                onClick={() => void send("Retry preparation.")}
                                className="fb-inset min-h-[40px] px-2.5 font-mono text-[9.5px] uppercase tracking-[0.06em] text-foreground"
                              >
                                Retry preparation
                              </button>
                            ) : null}
                            <Link
                              to="/trade"
                              className="min-h-[40px] px-1 font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted"
                            >
                              Open Trade manually
                            </Link>
                          </div>
                        </div>
                      ) : m.preparationError ? (
                        <p className="fb-inset px-2.5 py-2 font-mono text-[10px] leading-relaxed text-muted">
                          {m.preparationError}
                        </p>
                      ) : null}
                    </div>

                  ) : null}
                </div>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>

        {conversation.observation?.code === "HANDOFF_HYDRATION_FAILED" ? (
          <div className="space-y-1.5 border-t border-hairline px-4 py-2.5">
            <p className="font-mono text-[10px] leading-relaxed text-muted">
              {conversation.observation.surface} could not prefill the prepared plan:{" "}
              {conversation.observation.detail} Nothing was signed or submitted.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  clearConversationObservation();
                  void send("The Trade screen could not prefill that plan — prepare it again.");
                }}
                className="fb-inset min-h-[36px] px-2.5 font-mono text-[9.5px] uppercase tracking-[0.06em] text-foreground"
              >
                Prepare it again
              </button>
              <button
                type="button"
                onClick={() => clearConversationObservation()}
                className="min-h-[36px] px-1 font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        {error ? (

          <p
            role="alert"
            className="border-t border-hairline px-4 py-2 font-mono text-[10.5px] text-danger"
          >
            {error}
          </p>
        ) : null}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="flex items-center gap-2 border-t border-hairline p-2.5 sm:p-3"
        >
          <label className="sr-only" htmlFor="assistant-input">
            Ask Flow AI
          </label>
          <input
            id="assistant-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about rewards, a tx hash, staking…"
            className="fb-inset min-h-[44px] min-w-0 flex-1 bg-transparent px-3 text-[12.5px] text-foreground outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-primary/60"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send question"
            className="fb-glow grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
          >
            <ArrowUp className={`h-4 w-4 ${busy ? "animate-pulse" : ""}`} />
          </button>
        </form>
      </section>

      <AssistantMemoryPanel />

      <p className="px-1 font-mono text-[9.5px] leading-relaxed text-muted">
        Flow AI is read-only: it cannot swap, bridge, claim, stake or publish for you. FlowBridge
        will never ask for your seed phrase or private key. Always confirm amounts in the trade or
        stake screen before signing.
      </p>
    </div>
  );
}
