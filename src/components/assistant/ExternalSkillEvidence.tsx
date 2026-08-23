/**
 * FlowBridge V19 §8 — external evidence UX.
 *
 * Anything a federated BOT Chain skill returns is shown as clearly EXTERNAL,
 * with provider, freshness and an explicit "not FlowBridge canonical" label.
 * There is never an execute affordance here: at most, an insight can become a
 * candidate the user still has to build into a mission themselves.
 */
import { useState } from "react";
import { AlertTriangle, ExternalLink, Globe, Loader2, ShieldAlert } from "lucide-react";

interface CandidatePayload {
  insights: { label: string; detail: string; referenceUrl: string | null }[];
  mappedOpportunityKind: string | null;
  explanationOnly: boolean;
  explanationOnlyReason: string | null;
  unsafeContentFlagged: boolean;
  discardedProviderFields: string[];
  provenance: {
    provider: string;
    skillId: string;
    skillVersion: string;
    observedAt: string;
    freshness: string;
    cached: boolean;
  };
}

export function ExternalSkillEvidence() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<CandidatePayload | null>(null);

  const load = async () => {
    setLoading(true);
    setNotice(null);
    try {
      const res = await fetch("/api/ai/federation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          skillId: "bot.mock.research",
          capabilityKind: "PROTOCOL_READ",
          inputs: { topic: "staking" },
        }),
      });
      const json = await res.json();
      if (!json?.success) {
        setCandidate(null);
        setNotice(json?.notice ?? "BOT Chain skills are unavailable right now — FlowBridge data is unaffected.");
      } else {
        setCandidate(json.candidate as CandidatePayload);
        setOpen(true);
      }
    } catch {
      setNotice("Couldn't reach BOT Chain skills — FlowBridge data is unaffected.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-2xl border border-hairline bg-card-alt/60 p-3.5" data-testid="external-skill-evidence">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-muted/40 text-muted-foreground">
          <Globe className="h-3.5 w-3.5" />
        </span>
        <h2 className="flex-1 font-mono text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">
          BOT Chain skills <span className="text-muted-foreground/60">· external</span>
        </h2>
        <button
          type="button"
          onClick={() => (candidate ? setOpen((v) => !v) : load())}
          disabled={loading}
          className="rounded-lg border border-hairline px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-foreground disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : candidate ? (open ? "Hide" : "Show") : "Look up"}
        </button>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Context from external BOT Chain skills. It is advisory only — never FlowBridge canonical data, and never a
        transaction. Amounts, targets and rewards always come from FlowBridge.
      </p>

      {notice && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <AlertTriangle className="mt-[2px] h-3 w-3 shrink-0" /> {notice}
        </p>
      )}

      {open && candidate && (
        <div className="mt-3 space-y-2">
          {candidate.insights.map((i, idx) => (
            <article key={idx} className="rounded-xl border border-hairline bg-background/40 p-2.5">
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-muted/40 px-1.5 py-[1px] font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  external
                </span>
                <h3 className="truncate text-[12px] font-semibold">{i.label}</h3>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{i.detail}</p>
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

          {candidate.unsafeContentFlagged && (
            <p className="flex items-start gap-1.5 rounded-xl border border-warning/40 bg-warning/10 p-2.5 text-[11px] text-foreground">
              <ShieldAlert className="mt-[2px] h-3 w-3 shrink-0 text-warning" />
              This skill returned unsafe or executable content. FlowBridge removed it and ignored any instructions
              inside the response
              {candidate.discardedProviderFields.length > 0
                ? ` (discarded: ${candidate.discardedProviderFields.slice(0, 6).join(", ")}).`
                : "."}
            </p>
          )}

          <p className="text-[10px] leading-relaxed text-muted-foreground">
            {candidate.provenance.provider} · {candidate.provenance.skillId} v{candidate.provenance.skillVersion} ·{" "}
            {candidate.provenance.freshness.toLowerCase()} · observed{" "}
            {new Date(candidate.provenance.observedAt).toLocaleString()}
            {candidate.provenance.cached ? " · cached" : ""}
          </p>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {candidate.explanationOnly
              ? (candidate.explanationOnlyReason ?? "Informational only.")
              : "If you want to act on this, FlowBridge re-checks your live position first and you build the mission yourself."}
          </p>
        </div>
      )}
    </section>
  );
}
