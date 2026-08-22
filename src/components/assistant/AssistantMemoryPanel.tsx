import { useEffect, useState } from "react";
import { Brain, Trash2 } from "lucide-react";
import { assistantFetch, type AssistantMemory } from "@/lib/ai/assistantClient";

/**
 * V15.1 §7 — opt-in memory controls. Presentation only: every value is stored
 * and validated server-side, scoped to the signed-in user, and can be cleared
 * here at any time. Secrets and recovery phrases are rejected on the server.
 */
export function AssistantMemoryPanel() {
  const [open, setOpen] = useState(false);
  const [optedIn, setOptedIn] = useState(false);
  const [memories, setMemories] = useState<AssistantMemory[]>([]);
  const [key, setKey] = useState("preferred_style");
  const [value, setValue] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const res = await assistantFetch("/api/assistant/memory");
      if (res.status === 401) {
        setNote("Sign in to let Flow AI remember your preferences.");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { memories?: AssistantMemory[] };
      setMemories(data.memories ?? []);
      if ((data.memories ?? []).length > 0) setOptedIn(true);
    })();
  }, [open]);

  async function save() {
    if (!value.trim() || busy) return;
    setBusy(true);
    setNote(null);
    const res = await assistantFetch("/api/assistant/memory", {
      method: "POST",
      body: JSON.stringify({ key, value, optedIn }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      memories?: AssistantMemory[];
      error?: string;
    };
    if (!res.ok) setNote(data.error ?? "Could not save that.");
    else {
      setMemories(data.memories ?? []);
      setValue("");
      setNote("Saved.");
    }
    setBusy(false);
  }

  async function clear(k?: string) {
    setBusy(true);
    const res = await assistantFetch(`/api/assistant/memory${k ? `?key=${encodeURIComponent(k)}` : ""}`, {
      method: "DELETE",
    });
    const data = (await res.json().catch(() => ({}))) as { memories?: AssistantMemory[] };
    setMemories(data.memories ?? []);
    setNote(res.ok ? "Cleared." : "Could not clear that.");
    setBusy(false);
  }

  return (
    <section className="fb-surface overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
          <Brain className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
          Memory · opt-in · {memories.length} saved
        </span>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-hairline p-3 sm:p-4">
          <label className="flex items-start gap-2 font-mono text-[10.5px] leading-relaxed text-muted">
            <input
              type="checkbox"
              checked={optedIn}
              onChange={(e) => setOptedIn(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
            />
            Let Flow AI remember preferences (tone, default chain, favourite pairs). Never store
            secrets, seed phrases or private keys — the server rejects them.
          </label>

          <div className="grid gap-2 sm:grid-cols-[minmax(0,9rem)_1fr]">
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              aria-label="Preference name"
              className="fb-inset min-h-[40px] min-w-0 bg-transparent px-3 font-mono text-[11px] text-foreground outline-none"
            />
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. short answers, BOT Testnet by default"
              aria-label="Preference value"
              className="fb-inset min-h-[40px] min-w-0 bg-transparent px-3 text-[12px] text-foreground outline-none placeholder:text-muted"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || !optedIn || !value.trim()}
              className="min-h-[40px] rounded-xl bg-primary px-3 font-mono text-[10.5px] uppercase tracking-[0.08em] text-primary-foreground disabled:opacity-40"
            >
              Save preference
            </button>
            <button
              type="button"
              onClick={() => void clear()}
              disabled={busy || memories.length === 0}
              className="fb-inset min-h-[40px] px-3 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted disabled:opacity-40"
            >
              Clear all
            </button>
          </div>

          {memories.length > 0 ? (
            <ul className="space-y-1.5">
              {memories.map((m) => (
                <li key={m.key} className="fb-inset flex items-center gap-2 px-2.5 py-2">
                  <span className="min-w-0 flex-1 text-[11.5px] text-foreground">
                    <span className="font-mono text-[9.5px] uppercase tracking-[0.06em] text-primary">
                      {m.key}
                    </span>{" "}
                    {m.value}
                  </span>
                  <button
                    type="button"
                    onClick={() => void clear(m.key)}
                    aria-label={`Forget ${m.key}`}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {note ? (
            <p role="status" className="font-mono text-[10px] text-muted">
              {note}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
