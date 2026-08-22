import { useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, ChevronDown, ShieldCheck, Sparkles, User } from "lucide-react";
import { assistantFetch } from "@/lib/ai/assistantClient";
import { AssistantMemoryPanel } from "./AssistantMemoryPanel";
import { ActionIntentCard, type PreparedIntentPayload } from "./ActionIntentCard";

export interface EvidenceRef {
  id: string;
  label: string;
  group: string;
  freshness: string;
  observedAt: string;
  url?: string;
  excerpt?: string;
}

interface IntentProposalRef {
  type: string;
  chainId: number;
  parameters: Record<string, unknown>;
  recognized?: string[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  mode?: string;
  confidenceLabel?: string;
  asOf?: string | null;
  notice?: string | null;
  skills?: string[];
  evidence?: EvidenceRef[];
  /** V15.2 — server-prepared, never-executed action plan. */
  prepared?: PreparedIntentPayload | null;
  preparationError?: string | null;
}

const SUGGESTIONS = [
  "Summarize my rewards, staking and campaigns right now",
  "Why did my $11 swap earn that many points?",
  "What's actually live on BOT Chain today?",
  "How do I bridge USDT from BOT to BNB?",
];


/**
 * Flow AI surface. Presentation + fetch only — it never touches swap/bridge
 * execution state, and every answer arrives with its evidence trail from
 * /api/assistant.
 */
export function AssistantChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openEvidence, setOpenEvidence] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setError(null);
    setInput("");
    const next: ChatMessage[] = [...messages, { role: "user", content: question }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setBusy(true);

    try {
      const res = await assistantFetch("/api/assistant", {
        method: "POST",
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
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
      };
      if (!res.ok || !data.answer) {
        throw new Error(data.error ?? "Flow AI is unavailable right now.");
      }

      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: "assistant",
          content: data.answer!,
          mode: data.mode,
          confidenceLabel: data.confidenceLabel,
          asOf: data.asOf ?? null,
          notice: data.notice ?? null,
          skills: data.skills ?? [],
          evidence: data.evidence ?? [],
        };
        return copy;
      });

      if (data.proposal) void prepare(data.proposal);

    } catch (e: any) {
      setMessages((prev) => prev.slice(0, -1));
      setError(e?.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Asks the SERVER to prepare, policy-check and simulate the candidate action.
   * Nothing is executed here: the result is a review card whose CTA links to the
   * product surface, which revalidates before the user's wallet signs.
   */
  async function prepare(proposal: IntentProposalRef) {
    try {
      const res = await assistantFetch("/api/assistant/intent", {
        method: "POST",
        body: JSON.stringify({
          type: proposal.type,
          chainId: proposal.chainId,
          parameters: proposal.parameters,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as
        | (PreparedIntentPayload & { error?: string })
        | { error?: string };
      setMessages((prev) => {
        const copy = [...prev];
        const i = copy.length - 1;
        if (i < 0 || copy[i].role !== "assistant") return prev;
        copy[i] =
          res.ok && "intent" in payload
            ? { ...copy[i], prepared: payload as PreparedIntentPayload }
            : {
                ...copy[i],
                preparationError:
                  (payload as { error?: string }).error ??
                  "I couldn't prepare that plan, so I won't guess at it.",
              };
        return copy;
      });
    } catch {
      setMessages((prev) => {
        const copy = [...prev];
        const i = copy.length - 1;
        if (i < 0 || copy[i].role !== "assistant") return prev;
        copy[i] = {
          ...copy[i],
          preparationError: "Action preparation is unavailable right now.",
        };
        return copy;
      });
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
              Evidence-grounded · read-only · never asks for keys
            </p>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
          {messages.length === 0 ? (
            <div className="space-y-3">
              <p className="font-mono text-[11px] leading-relaxed text-muted">
                Ask about your rewards, a transaction, staking, campaigns or BOT Chain. Flow AI
                answers from your FlowBridge data and on-chain evidence — it can explain and
                prepare, but it never signs or submits anything.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
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
                        {m.asOf ? (
                          <span className="rounded-md bg-foreground/6 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
                            as of {new Date(m.asOf).toLocaleString()}
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
                                    {e.group} · {e.freshness}
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

                      {m.prepared ? <ActionIntentCard payload={m.prepared} /> : null}
                      {m.preparationError ? (
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
