/**
 * FlowBridge V20 §10 — federated insight UX.
 *
 * Two clearly separated evidence classes: EXTERNAL (untrusted skill context) and
 * FLOWBRIDGE VERIFIED (canonical reconciliation). A Build mission control is
 * rendered ONLY after canonical reconciliation succeeded, and it compiles from
 * the canonical opportunity identity through V18 — never from provider JSON.
 * No approve/claim/stake/swap affordance exists on this panel.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ExternalLink, Globe, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { compileOpportunityIntoMission } from "@/lib/ai/mission/missionClient";
import { supabase } from "@/integrations/supabase/client";

interface Reconciliation {
  status: "ACCEPTED_CANONICAL" | "CONTRADICTED" | "STALE" | "UNSUPPORTED" | "DEGRADED";
  opportunityId: string | null;
  opportunityKind: string | null;
  buildMissionAvailable: boolean;
  templateId: string | null;
  unresolvedSlots: string[];
  contradictions: { field: string; note: string }[];
  canonicalEvidenceIds: string[];
  externalProvenance: {
    provider: string;
    skillId: string;
    skillVersion: string;
    observedAt: string;
    freshness: string;
    cached: boolean;
  };
  insights: { label: string; detail: string; referenceUrl: string | null }[];
  externalEvidenceExpired: boolean;
  explanation: string;
  opportunity: { title: string; reason: string } | null;
}

const STATUS_LABEL: Record<Reconciliation["status"], string> = {
  ACCEPTED_CANONICAL: "Verified by FlowBridge",
  CONTRADICTED: "Not confirmed by FlowBridge",
  STALE: "External evidence expired",
  UNSUPPORTED: "Explanation only",
  DEGRADED: "Canonical state unavailable",
};

export function FederatedInsightPanel() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [data, setData] = useState<Reconciliation | null>(null);

  const load = async () => {
    setLoading(true);
    setNotice(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) {
        setNotice("Sign in so FlowBridge can check external insights against your own live state.");
        return;
      }
      const res = await fetch("/api/ai/federated-insight", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          skillId: "bot.mock.research",
          capabilityKind: "GENERAL_ANALYSIS",
          inputs: { question: "Is staking worth reviewing on BOT chain right now?" },
        }),
      });
      const json = await res.json();
      if (!json?.success) {
        setData(null);
        setNotice(
          json?.notice ??
            json?.error ??
            "BOT Chain skills are unavailable right now — your FlowBridge opportunities are unaffected.",
        );
        return;
      }
      setData(json.reconciliation as Reconciliation);
    } catch {
      setNotice("Couldn't reach BOT Chain skills — your FlowBridge data is unaffected.");
    } finally {
      setLoading(false);
    }
  };

  const build = async () => {
    if (!data?.opportunityId) return;
    setBuilding(true);
    setNotice(null);
    try {
      /** §7 — V18 re-resolves this canonical opportunity id server-side. */
      const res = await compileOpportunityIntoMission(data.opportunityId);
      if (res.mission) {
        navigate({ to: "/assistant" });
      } else {
        setNotice(res.message ?? res.error ?? "That opportunity is no longer actionable.");
      }
    } finally {
      setBuilding(false);
    }
  };

  return (
    <section
      className="rounded-2xl border border-hairline bg-card-alt/60 p-3.5"
      data-testid="federated-insight-panel"
    >
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-muted/40 text-muted-foreground">
          <Globe className="h-3.5 w-3.5" />
        </span>
        <h2 className="flex-1 font-mono text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">
          BOT Chain insight <span className="text-muted-foreground/60">· reconciled</span>
        </h2>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-hairline px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-foreground disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : data ? "Re-check" : "Look up"}
        </button>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        External skills can suggest what to look at. FlowBridge re-reads your live state before anything becomes
        actionable — amounts, fees and targets are always canonical.
      </p>

      {notice && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <AlertTriangle className="mt-[2px] h-3 w-3 shrink-0" /> {notice}
        </p>
      )}

      {data && (
        <div className="mt-3 space-y-2.5">
          {/* EXTERNAL evidence */}
          <div className="rounded-xl border border-hairline bg-background/40 p-2.5">
            <span className="rounded bg-muted/40 px-1.5 py-[1px] font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              external · untrusted
            </span>
            {data.insights.map((i, idx) => (
              <article key={idx} className="mt-2">
                <h3 className="truncate text-[12px] font-semibold">{i.label}</h3>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{i.detail}</p>
                {i.referenceUrl && (
                  <a
                    href={i.referenceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-primary"
                  >
                    Source <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </article>
            ))}
            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
              {data.externalProvenance.provider} · {data.externalProvenance.skillId} v
              {data.externalProvenance.skillVersion} · {data.externalProvenance.freshness.toLowerCase()} · observed{" "}
              {new Date(data.externalProvenance.observedAt).toLocaleString()}
              {data.externalProvenance.cached ? " · cached" : ""}
              {data.externalEvidenceExpired ? " · expired" : ""}
            </p>
          </div>

          {/* CANONICAL reconciliation */}
          <div
            className={`rounded-xl border p-2.5 ${
              data.status === "ACCEPTED_CANONICAL"
                ? "border-success/40 bg-success/10"
                : "border-hairline bg-background/40"
            }`}
          >
            <span className="inline-flex items-center gap-1 rounded bg-muted/40 px-1.5 py-[1px] font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              <ShieldCheck className="h-2.5 w-2.5" /> {STATUS_LABEL[data.status]}
            </span>
            {data.opportunity && (
              <>
                <h3 className="mt-2 text-[12px] font-semibold">{data.opportunity.title}</h3>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  {data.opportunity.reason}
                </p>
              </>
            )}
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{data.explanation}</p>
            {data.canonicalEvidenceIds.length > 0 && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                FlowBridge evidence: {data.canonicalEvidenceIds.slice(0, 4).join(", ")}
              </p>
            )}
            {data.unresolvedSlots.length > 0 && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                You still supply: {data.unresolvedSlots.join(", ")} — never taken from the skill.
              </p>
            )}

            {data.buildMissionAvailable && data.opportunityId && (
              <button
                type="button"
                onClick={build}
                disabled={building}
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-primary-foreground disabled:opacity-50"
              >
                {building && <Loader2 className="h-3 w-3 animate-spin" />} Build mission
              </button>
            )}
          </div>

          {data.contradictions.length > 0 && (
            <div className="rounded-xl border border-warning/40 bg-warning/10 p-2.5">
              <p className="flex items-start gap-1.5 text-[11px] text-foreground">
                <ShieldAlert className="mt-[2px] h-3 w-3 shrink-0 text-warning" />
                FlowBridge overrode what this skill tried to establish:
              </p>
              <ul className="mt-1 space-y-0.5">
                {data.contradictions.slice(0, 6).map((c) => (
                  <li key={c.field} className="text-[10px] leading-relaxed text-muted-foreground">
                    · {c.note}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
