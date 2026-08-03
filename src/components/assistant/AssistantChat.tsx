import { useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, Sparkles, User } from "lucide-react";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "How do I bridge USDT to BNB?",
  "How do FLOW points work?",
  "Why did my swap need an approval?",
  "What fees does FlowBridge charge?",
];

/**
 * Streaming assistant chat surface. Presentation + fetch only — it never touches
 * swap/bridge execution state and gets all answers from /api/assistant.
 */
export function AssistantChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}) as { error?: string });
        throw new Error(data.error ?? "The assistant is unavailable right now.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload);
            const delta: string = json?.choices?.[0]?.delta?.content ?? "";
            if (delta) {
              answer += delta;
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: answer };
                return copy;
              });
            }
          } catch {
            /* partial JSON chunk — wait for more */
          }
        }
      }

      if (!answer) {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: "assistant",
            content: "I couldn't produce an answer for that. Try rephrasing?",
          };
          return copy;
        });
      }
    } catch (e: any) {
      setMessages((prev) => prev.slice(0, -1));
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
          <div className="min-w-0">
            <p className="fb-eyebrow">Flow assistant</p>
            <p className="truncate font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">
              Guides only — never asks for keys
            </p>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
          {messages.length === 0 ? (
            <div className="space-y-3">
              <p className="font-mono text-[11px] leading-relaxed text-muted">
                Ask about swapping, bridging, fees, gas or FLOW points. Answers explain how
                FlowBridge works — they are never financial advice.
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
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-[12.5px] leading-relaxed ${
                    m.role === "user"
                      ? "bg-primary/12 text-foreground"
                      : "fb-inset text-foreground"
                  }`}
                >
                  {m.content ||
                    (busy && i === messages.length - 1 ? (
                      <span className="font-mono text-[10.5px] text-muted">Thinking…</span>
                    ) : null)}
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
            Ask the FlowBridge assistant
          </label>
          <input
            id="assistant-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about swaps, bridging, fees…"
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

      <p className="px-1 font-mono text-[9.5px] leading-relaxed text-muted">
        FlowBridge will never ask for your seed phrase or private key. The assistant can be wrong —
        always confirm amounts in the swap or bridge screen before signing.
      </p>
    </div>
  );
}
