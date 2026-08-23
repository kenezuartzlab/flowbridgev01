/**
 * FlowBridge V16 §3/§4/§10 — "For you now" insight module.
 *
 * Presentation only. Every number rendered here comes from the server feed's
 * canonical `economicSnapshot`; this component never computes economics, never
 * estimates and never signs. Actionable items link to the existing product
 * surface, which owns the frozen V15.3 human-authorized action path.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";
import {
  AlertTriangle,
  ChevronDown,
  Clock,
  Gift,
  Sparkles,
  Target,
  Vault,
  Wallet,
  X,
} from "lucide-react";
import { assistantFetch } from "@/lib/ai/assistantClient";
import { setConversationDraft } from "@/lib/ai/conversationStore";
import type { OpportunityFeed as Feed, RankedOpportunity } from "@/lib/ai/opportunity/opportunityTypes";

const DOMAIN_ICON = {
  REWARDS: Gift,
  STAKING: Vault,
  CAMPAIGNS: Target,
  TRADE: Sparkles,
  WALLET: Wallet,
  ECOSYSTEM: Sparkles,
} as const;

function provenanceTone(p: RankedOpportunity["provenance"]) {
  if (p === "LIVE") return "text-success";
  if (p === "CACHED") return "text-muted";
  return "text-danger";
}

function expiryLabel(iso: string | null): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "ended";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return `${Math.max(1, Math.floor(ms / 60_000))}m left`;
  if (hours < 48) return `${hours}h left`;
  return `${Math.floor(hours / 24)}d left`;
}

export function OpportunityFeed() {
  const router = useRouter();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await assistantFetch("/api/opportunities?limit=4");
        const json = await res.json();
        if (!cancelled && json?.feed) setFeed(json.feed as Feed);
      } catch {
        /* degraded: the module simply does not render */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(
    () => (feed?.items ?? []).filter((i) => !hidden.includes(i.id)),
    [feed, hidden],
  );

  /** V16 §6 — mark seen once so unchanged state stops nagging on later visits. */
  useEffect(() => {
    if (!feed || feed.items.length === 0) return;
    for (const item of feed.items) {
      void assistantFetch("/api/opportunities", {
        method: "POST",
        body: JSON.stringify({ key: item.id, action: "SEEN" }),
      }).catch(() => {});
    }
  }, [feed]);

  const mutateState = useCallback((key: string, action: "DISMISS" | "SNOOZE") => {
    setHidden((prev) => [...prev, key]);
    void assistantFetch("/api/opportunities", {
      method: "POST",
      body: JSON.stringify({ key, action }),
    }).catch(() => {});
  }, []);

  const explain = useCallback(
    (item: RankedOpportunity) => {
      setConversationDraft(`Explain this opportunity: ${item.title} (${item.id})`);
      void router.navigate({ to: "/assistant" });
    },
    [router],
  );

  if (loading) {
    return (
      <section className="fb-surface p-4">
        <div className="fb-inset h-16 animate-pulse" />
      </section>
    );
  }
  if (items.length === 0) return null;

  return (
    <section className="fb-surface overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <p className="fb-eyebrow flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          For you now
        </p>
        <span className="font-mono text-[9.5px] font-black uppercase tracking-[0.1em] text-muted">
          Flow AI insights
        </span>
      </div>

      <ul className="divide-y divide-hairline">
        {items.map((item) => {
          const Icon = DOMAIN_ICON[item.domain] ?? Sparkles;
          const expiry = expiryLabel(item.expiresAt);
          const expanded = open === item.id;
          return (
            <li key={item.id} className="px-3 py-3 sm:px-4">
              <div className="flex items-start gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[12px] font-black uppercase tracking-[0.05em]">
                    {item.title}
                  </p>
                  <p className="mt-0.5 line-clamp-2 font-mono text-[10px] leading-relaxed text-muted">
                    {item.reason}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span
                      className={`font-mono text-[9px] font-black uppercase tracking-[0.1em] ${provenanceTone(item.provenance)}`}
                    >
                      {item.provenance}
                    </span>
                    {expiry && (
                      <span className="flex items-center gap-1 font-mono text-[9px] font-black uppercase tracking-[0.1em] text-muted">
                        <Clock className="h-3 w-3" />
                        {expiry}
                      </span>
                    )}
                    {item.containsPrivateEvidence && item.actorScope !== "PUBLIC" && (
                      <span className="font-mono text-[9px] font-black uppercase tracking-[0.1em] text-muted">
                        Private to you
                      </span>
                    )}
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <Link
                      to={item.recommendedSurface.href}
                      className="rounded-xl bg-primary px-3 py-1.5 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-primary-foreground"
                    >
                      {item.recommendedSurface.label}
                    </Link>
                    <button
                      type="button"
                      onClick={() => explain(item)}
                      className="rounded-xl border border-hairline px-3 py-1.5 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-muted transition-colors hover:text-foreground"
                    >
                      Ask Flow AI
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpen(expanded ? null : item.id)}
                      aria-expanded={expanded}
                      className="flex items-center gap-1 font-mono text-[9.5px] font-black uppercase tracking-[0.1em] text-primary"
                    >
                      Why this matters
                      <ChevronDown
                        className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`}
                      />
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={() => mutateState(item.id, "DISMISS")}
                  className="shrink-0 rounded-lg p-1 text-muted transition-colors hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {expanded && (
                <div className="fb-inset mt-2.5 space-y-2 p-3">
                  <p className="font-mono text-[9px] font-black uppercase tracking-[0.12em] text-muted">
                    Evidence used
                  </p>
                  <ul className="space-y-2">
                    {item.evidenceRefs.map((ev) => (
                      <li key={ev.id}>
                        <p className="font-mono text-[10px] font-black uppercase tracking-[0.06em]">
                          {ev.label}
                        </p>
                        <p className="font-mono text-[9.5px] leading-relaxed text-muted">
                          {item.actorScope !== "PUBLIC" &&
                          (ev.dataClass === "FLOWBRIDGE_DB" || ev.dataClass === "USER_MEMORY")
                            ? "Your private FlowBridge data"
                            : "Canonical FlowBridge / on-chain data"}{" "}
                          · {ev.authority} · {ev.freshness} ·{" "}
                          {new Date(ev.observedAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        {ev.excerpt && (
                          <p className="mt-0.5 font-mono text-[9.5px] leading-relaxed text-muted">
                            {ev.excerpt}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="font-mono text-[9px] leading-relaxed text-muted">
                    Reason codes: {item.reasonCodes.join(", ")} · id {item.id}
                  </p>
                  <button
                    type="button"
                    onClick={() => mutateState(item.id, "SNOOZE")}
                    className="rounded-xl border border-hairline px-3 py-1.5 font-mono text-[9.5px] font-black uppercase tracking-[0.1em] text-muted"
                  >
                    Snooze 24h
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {feed && feed.degradedDomains.length > 0 && (
        <p className="flex items-start gap-1.5 border-t border-hairline px-4 py-2.5 font-mono text-[9.5px] leading-relaxed text-muted">
          <AlertTriangle className="mt-[1px] h-3 w-3 shrink-0" />
          {feed.degradedDomains.join(", ").toLowerCase()} data is unavailable right now, so nothing is
          shown for it — no values are estimated.
        </p>
      )}
    </section>
  );
}
