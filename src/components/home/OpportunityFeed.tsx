/**
 * FlowBridge V22 §8 — "For you now" personalized decision module.
 *
 * Presentation only. Ranking, reason codes and every economic fact come from the
 * server-side V22 decision engine (grounded in canonical V16 snapshots). This
 * component never computes economics, never estimates, never signs, and never
 * creates a mission implicitly — Build mission stays an explicit tap that asks
 * the server to re-resolve the canonical opportunity.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
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
import { ensureConversationOwner, setConversationDraft } from "@/lib/ai/conversationStore";
import { supabase } from "@/integrations/supabase/client";
import { compileOpportunityIntoMission } from "@/lib/ai/mission/missionClient";
import type { DecisionItem, DecisionResult } from "@/lib/ai/decision/decisionTypes";

const DOMAIN_ICON = {
  REWARDS: Gift,
  STAKING: Vault,
  CAMPAIGNS: Target,
  TRADE: Sparkles,
  WALLET: Wallet,
  ECOSYSTEM: Sparkles,
} as const;

function provenanceTone(p: DecisionItem["provenance"]) {
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
  const [decision, setDecision] = useState<DecisionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [compiling, setCompiling] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await assistantFetch("/api/ai/decision?limit=3");
        const json = await res.json();
        if (!cancelled && json?.decision) setDecision(json.decision as DecisionResult);
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
    () => (decision?.items ?? []).filter((i) => !hidden.includes(i.id)),
    [decision, hidden],
  );

  /** V22 §11 — mark seen once so unchanged state stops repeating on later visits. */
  useEffect(() => {
    if (!decision) return;
    for (const item of decision.items) {
      if (!item.opportunityId) continue;
      void assistantFetch("/api/opportunities", {
        method: "POST",
        body: JSON.stringify({ key: item.opportunityId, action: "SEEN" }),
      }).catch(() => {});
    }
  }, [decision]);

  /** Presentation-only state. Never an economic invalidation (V22 §7). */
  const mutateState = useCallback((item: DecisionItem, action: "DISMISS" | "SNOOZE") => {
    setHidden((prev) => [...prev, item.id]);
    if (!item.opportunityId) return;
    void assistantFetch("/api/opportunities", {
      method: "POST",
      body: JSON.stringify({ key: item.opportunityId, action }),
    }).catch(() => {});
  }, []);

  const explain = useCallback(
    async (item: DecisionItem) => {
      try {
        const { data } = await supabase.auth.getUser();
        ensureConversationOwner(data.user?.id ?? "anonymous");
      } catch {
        /* presentation-only */
      }
      setConversationDraft(
        item.kind === "CONTINUE_MISSION"
          ? `Explain my active mission: ${item.what}`
          : `Explain this opportunity: ${item.title} (${item.id})`,
      );
      void router.navigate({ to: "/assistant" });
    },
    [router],
  );

  /**
   * V18 §3 / V22 §10 — explicit initiation. Tapping this asks the SERVER to
   * re-resolve the opportunity and compile a typed plan; it never sends a
   * transaction and never carries the card's displayed numbers into the mission.
   */
  const buildMission = useCallback(
    async (item: DecisionItem) => {
      if (!item.opportunityId) return;
      setCompiling(item.id);
      setNotice(null);
      try {
        const res = await compileOpportunityIntoMission(item.opportunityId);
        if (!res.success || !res.mission) {
          setNotice({
            id: item.id,
            ok: false,
            text: res.message ?? res.error ?? "This opportunity could not be turned into a mission.",
          });
          return;
        }
        try {
          const { data } = await supabase.auth.getUser();
          ensureConversationOwner(data.user?.id ?? "anonymous");
        } catch {
          /* presentation-only */
        }
        setConversationDraft(`Open my mission: ${res.mission.goalText}`);
        void router.navigate({ to: "/assistant" });
      } catch {
        setNotice({ id: item.id, ok: false, text: "The mission could not be built right now." });
      } finally {
        setCompiling(null);
      }
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
          {decision?.memoryUsed ? "Personalized · your preferences" : "Flow AI insights"}
        </span>
      </div>

      <ul className="divide-y divide-hairline">
        {items.map((item) => {
          const Icon = item.domain ? (DOMAIN_ICON[item.domain] ?? Sparkles) : Target;
          const expiry = expiryLabel(item.expiresAt);
          const expanded = open === item.id;
          return (
            <li key={item.id} className="px-3 py-3 sm:px-4">
              <div className="flex items-start gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[9px] font-black uppercase tracking-[0.1em] text-muted">
                      #{item.rank}
                    </span>
                    <p className="truncate font-mono text-[12px] font-black uppercase tracking-[0.05em]">
                      {item.title}
                    </p>
                  </div>
                  <p className="mt-0.5 line-clamp-2 font-mono text-[10px] leading-relaxed text-muted">
                    {item.whyNow}
                  </p>
                  <p className="mt-1 line-clamp-2 font-mono text-[9.5px] leading-relaxed text-muted">
                    {item.whatNext}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span
                      className={`font-mono text-[9px] font-black uppercase tracking-[0.1em] ${provenanceTone(item.provenance)}`}
                    >
                      {item.provenance}
                    </span>
                    {item.requiresWalletConfirmation && (
                      <span className="font-mono text-[9px] font-black uppercase tracking-[0.1em] text-primary">
                        Your wallet confirms
                      </span>
                    )}
                    {expiry && (
                      <span className="flex items-center gap-1 font-mono text-[9px] font-black uppercase tracking-[0.1em] text-muted">
                        <Clock className="h-3 w-3" />
                        {expiry}
                      </span>
                    )}
                    {item.containsPrivateEvidence && (
                      <span className="font-mono text-[9px] font-black uppercase tracking-[0.1em] text-muted">
                        Private to you
                      </span>
                    )}
                  </div>

                  {item.blocked && item.blockerText && (
                    <p className="mt-1.5 font-mono text-[9.5px] leading-relaxed text-danger">
                      {item.blockerText}
                    </p>
                  )}

                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <Link
                      to={item.surface.href}
                      className="rounded-xl bg-primary px-3 py-1.5 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-primary-foreground"
                    >
                      {item.surface.label}
                    </Link>
                    {item.supportsMission && (
                      <button
                        type="button"
                        disabled={compiling === item.id}
                        onClick={() => void buildMission(item)}
                        className="rounded-xl border border-primary/40 bg-primary/10 px-3 py-1.5 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-primary transition-opacity disabled:opacity-50"
                      >
                        {compiling === item.id ? "Building…" : "Build mission"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void explain(item)}
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
                      Why this is first
                      <ChevronDown
                        className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`}
                      />
                    </button>
                  </div>
                </div>
                {item.kind === "OPPORTUNITY" && (
                  <button
                    type="button"
                    aria-label="Dismiss"
                    onClick={() => mutateState(item, "DISMISS")}
                    className="shrink-0 rounded-lg p-1 text-muted transition-colors hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {notice?.id === item.id && (
                <p
                  className={`mt-2 font-mono text-[9.5px] leading-relaxed ${notice.ok ? "text-success" : "text-danger"}`}
                  role="status"
                >
                  {notice.text}
                </p>
              )}

              {expanded && (
                <div className="fb-inset mt-2.5 space-y-2 p-3">
                  <p className="font-mono text-[9px] font-black uppercase tracking-[0.12em] text-muted">
                    Why this is ranked here
                  </p>
                  <p className="font-mono text-[9.5px] leading-relaxed text-muted">
                    {item.reasonCodes.join(" · ")}
                  </p>
                  {item.facts.length > 0 && (
                    <>
                      <p className="font-mono text-[9px] font-black uppercase tracking-[0.12em] text-muted">
                        Canonical facts used
                      </p>
                      <ul className="space-y-1">
                        {item.facts.map((f) => (
                          <li
                            key={`${item.id}-${f.label}`}
                            className="font-mono text-[9.5px] leading-relaxed text-muted"
                          >
                            {f.label}: {f.value} · {f.source.replace(/_/g, " ").toLowerCase()}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {item.evidenceRefs.length > 0 && (
                    <>
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
                              {ev.dataClass === "FLOWBRIDGE_DB" || ev.dataClass === "USER_MEMORY"
                                ? "Your private FlowBridge data"
                                : "Canonical FlowBridge / on-chain data"}{" "}
                              · {ev.authority} · {ev.freshness} ·{" "}
                              {new Date(ev.observedAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {item.kind === "OPPORTUNITY" && (
                    <button
                      type="button"
                      onClick={() => mutateState(item, "SNOOZE")}
                      className="rounded-xl border border-hairline px-3 py-1.5 font-mono text-[9.5px] font-black uppercase tracking-[0.1em] text-muted"
                    >
                      Snooze 24h
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {decision?.notice && (
        <p className="flex items-start gap-1.5 border-t border-hairline px-4 py-2.5 font-mono text-[9.5px] leading-relaxed text-muted">
          <AlertTriangle className="mt-[1px] h-3 w-3 shrink-0" />
          {decision.notice}
        </p>
      )}
    </section>
  );
}
