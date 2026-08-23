/**
 * FlowBridge V21 §8 — multi-skill deliberation UX.
 *
 * Shows a compact "Compared N sources" conclusion, keeps EXTERNAL evidence
 * visually separate from VERIFIED BY FLOWBRIDGE, and states disagreement
 * explicitly instead of blending it. There is no approve/claim/stake/swap
 * affordance here; Build mission remains a V18 canonical-identity action.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronDown,
  Globe,
  Layers,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { compileOpportunityIntoMission } from "@/lib/ai/mission/missionClient";
import { supabase } from "@/integrations/supabase/client";

interface SourceReport {
  skillId: string;
  provider: string;
  skillVersion: string;
  resultClass: string;
  ok: boolean;
  latencyMs: number;
  freshness: string | null;
  cached: boolean;
  claimCount: number;
  unsafeContentFlagged: boolean;
  degradedNotice: string | null;
}

interface Claim {
  id: string;
  provider: string;
  subject: string;
  statement: string;
  qualityScore: number;
  referenceUrl: string | null;
  expired: boolean;
}

interface Deliberation {
  status: "OK" | "DEGRADED" | "CANONICAL_ONLY" | "NO_EVIDENCE";
  degraded: boolean;
  comparedSourceCount: number;
  recommendationSummary: string;
  candidateOpportunityKind: string | null;
  selectedSkills: SourceReport[];
  excludedSkills: { skillId: string; reason: string }[];
  rejectedClientSkillIds: string[];
  claims: Claim[];
  edges: { id: string; relation: string; reason: string }[];
  contradictionIds: string[];
  unresolvedQuestions: string[];
  canonicalOverrides: { field: string; note: string }[];
  reconciliation: {
    status: string;
    opportunityId: string | null;
    opportunityKind: string | null;
    buildMissionAvailable: boolean;
    unresolvedSlots: string[];
    explanation: string;
    opportunity: { title: string; reason: string } | null;
  } | null;
}

export function DeliberationPanel() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [data, setData] = useState<Deliberation | null>(null);

  const run = async () => {
    setLoading(true);
    setNotice(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) {
        setNotice("Sign in so FlowBridge can compare external sources against your live state.");
        return;
      }
      const res = await fetch("/api/ai/deliberate", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          question: "What should I focus on next on BOT chain — claiming rewards or staking?",
          capabilityKinds: ["GENERAL_ANALYSIS"],
        }),
      });
      const json = await res.json();
      if (!json?.success) {
        setData(null);
        setNotice(json?.error ?? "Deliberation is unavailable right now.");
        return;
      }
      setData(json.deliberation as Deliberation);
    } catch {
      setNotice("Could not reach FlowBridge deliberation. Your data is unaffected.");
    } finally {
      setLoading(false);
    }
  };

  const build = async () => {
    const id = data?.reconciliation?.opportunityId;
    if (!id) return;
    setBuilding(true);
    setNotice(null);
    try {
      const result = await compileOpportunityIntoMission(id);
      if (result?.mission?.id) navigate({ to: "/assistant" });
      else
        setNotice(
          result?.error ??
            result?.message ??
            "FlowBridge could not compile a mission from that opportunity.",
        );
    } catch {
      setNotice("Mission compilation failed. Nothing was executed.");
    } finally {
      setBuilding(false);
    }
  };

  const contradictions = (data?.edges ?? []).filter((e) => e.relation === "CONTRADICTS");

  return (
    <section
      data-testid="deliberation-panel"
      className="rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Multi-source deliberation</h2>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium hover:bg-muted/60 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Compare sources
        </button>
      </header>

      <p className="mt-2 text-xs text-muted-foreground">
        FlowBridge asks several approved read-only BOT Chain skills, compares what they say and keeps
        every amount, target and balance canonical. Agreement between sources never authorizes
        anything.
      </p>

      {notice && (
        <p className="mt-3 rounded-lg border border-border/60 bg-muted/40 p-2 text-xs text-muted-foreground">
          {notice}
        </p>
      )}

      {data && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
              Compared {data.comparedSourceCount} sources
            </span>
            {data.degraded && (
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-600">
                Degraded — {data.status}
              </span>
            )}
            {contradictions.length > 0 && (
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-semibold text-destructive">
                {contradictions.length} conflict{contradictions.length > 1 ? "s" : ""}
              </span>
            )}
          </div>

          <p className="text-sm leading-relaxed">{data.recommendationSummary}</p>

          {data.unresolvedQuestions.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-400">
              {data.unresolvedQuestions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          )}

          {data.reconciliation && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
                <ShieldCheck className="h-3.5 w-3.5" />
                Verified by FlowBridge · {data.reconciliation.status}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{data.reconciliation.explanation}</p>
              {data.reconciliation.opportunity && (
                <p className="mt-2 text-sm font-medium">{data.reconciliation.opportunity.title}</p>
              )}
              {data.reconciliation.buildMissionAvailable && (
                <>
                  <button
                    type="button"
                    onClick={build}
                    disabled={building}
                    className="mt-2 inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    {building && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Build mission
                  </button>
                  {data.reconciliation.unresolvedSlots.length > 0 && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      You still supply: {data.reconciliation.unresolvedSlots.join(", ")} — never taken
                      from a skill.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {!data.reconciliation && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
                <ShieldCheck className="h-3.5 w-3.5" />
                Verified by FlowBridge · CANONICAL ONLY
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Nothing above became actionable. FlowBridge published no opportunity, amount, target
                or mission from these external sources — your live FlowBridge state is unchanged and
                remains the only basis for anything you can sign.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
            Evidence drawer
          </button>

          {open && (
            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-3">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Globe className="h-3.5 w-3.5" />
                  External · untrusted
                </div>
                <ul className="mt-2 space-y-2">
                  {data.claims.map((c) => (
                    <li key={c.id} className="rounded-lg border border-border/50 bg-background/60 p-2">
                      <p className="text-[11px] font-semibold">
                        {c.provider} · {c.subject} · rank {c.qualityScore}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{c.statement}</p>
                    </li>
                  ))}
                </ul>
              </div>

              {contradictions.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-destructive">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Disagreement
                  </div>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {contradictions.map((e) => (
                      <li key={e.id}>{e.reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {data.canonicalOverrides.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Canonical overrides
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {data.canonicalOverrides.slice(0, 8).map((o, i) => (
                      <li key={`${o.field}-${i}`}>{o.note}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Sources selected by FlowBridge
                </p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {data.selectedSkills.map((s) => (
                    <li key={s.skillId}>
                      {s.provider} v{s.skillVersion} · {s.resultClass} · {s.latencyMs}ms
                      {s.freshness ? ` · ${s.freshness}` : ""}
                      {s.unsafeContentFlagged ? " · unsafe content stripped" : ""}
                      {s.degradedNotice ? ` · ${s.degradedNotice}` : ""}
                    </li>
                  ))}
                  {data.excludedSkills.map((s) => (
                    <li key={s.skillId} className="opacity-70">
                      {s.skillId} — excluded ({s.reason})
                    </li>
                  ))}
                  {data.rejectedClientSkillIds.length > 0 && (
                    <li className="text-destructive">
                      Client-requested skills refused: {data.rejectedClientSkillIds.join(", ")}
                    </li>
                  )}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
