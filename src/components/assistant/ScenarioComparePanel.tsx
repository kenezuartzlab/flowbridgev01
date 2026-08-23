/**
 * FlowBridge V23 §8/§12 — scenario comparison UX.
 *
 * Answers "what happens if I claim only vs claim and stake half?" with a compact
 * 2-3 option comparison. Exact canonical facts stay visually separate from
 * derived previews and from values that cannot be known until settlement.
 *
 * There is NO claim/stake/approve/sign affordance here. Building a mission stays
 * an explicit V18 action from the canonical opportunity surface.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  Droplets,
  FlaskConical,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type ValueClass = "CANONICAL_EXACT" | "DERIVED_PREVIEW" | "UNKNOWN_UNTIL_SETTLEMENT";

interface Fact {
  label: string;
  value: string;
  unit: string | null;
  valueClass: ValueClass;
  source: string;
}

interface Scenario {
  scenarioId: string;
  scenarioKind: string;
  label: string;
  whatChanges: string;
  liquidityNote: string;
  prerequisites: string[];
  exactFacts: Fact[];
  estimatedFacts: Fact[];
  assumptions: string[];
  unresolvedExecutionValues: string[];
  expectedWalletConfirmations: number;
  expectedWalletConfirmationLabels: string[];
  expectedStateChanges: string[];
  blockers: string[];
  explanationOnly: boolean;
  missionId: string | null;
  freshness: string;
}

interface ScenarioSet {
  requestId: string;
  generatedAt: string;
  snapshot: { snapshotId: string; freshness: string; provenance: string; claimableFlow: number | null };
  scenarios: Scenario[];
  planningInputs: { stakePercent: number | null; preSelectedFromMemory: boolean; rejectedClientFields: string[] };
  recommendedScenarioId: string | null;
  recommendationReason: string | null;
  activeMissionIds: string[];
  stale: boolean;
  staleReason: string | null;
  status: string;
  notice: string | null;
  memoryUsed: boolean;
}

const PERCENTS = [25, 50, 100] as const;

export function ScenarioComparePanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [set, setSet] = useState<ScenarioSet | null>(null);

  const load = useCallback(
    async (p: number | null) => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const params = new URLSearchParams();
        if (p) params.set("stakePercent", String(p));
        const res = await fetch(`/api/ai/scenarios?${params.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const json = await res.json();
        if (!res.ok || json?.error) throw new Error(json?.error ?? "Comparison unavailable");
        setSet(json.scenarioSet);
      } catch (e: any) {
        setError(e?.message ?? "Comparison unavailable");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (open && !set && !loading) void load(percent);
  }, [open, set, loading, percent, load]);

  return (
    <section className="rounded-2xl border border-hairline bg-card-alt">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-3 text-left"
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
          <FlaskConical className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-[11px] font-black uppercase tracking-[0.14em]">
            Compare safe paths
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            Preview only — nothing is prepared, signed or submitted here.
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-hairline p-3">
          {/* §7 — planning input only. Never authorization. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Stake portion
            </span>
            {PERCENTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setPercent(p);
                  void load(p);
                }}
                className={`rounded-lg border px-2.5 py-1 font-mono text-[11px] font-bold ${
                  (set?.planningInputs.stakePercent ?? percent) === p
                    ? "border-primary bg-primary/12 text-primary"
                    : "border-hairline text-muted-foreground"
                }`}
              >
                {p}%
              </button>
            ))}
            <button
              type="button"
              onClick={() => void load(percent)}
              className="ml-auto inline-flex items-center gap-1 rounded-lg border border-hairline px-2 py-1 text-[11px] text-muted-foreground"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Refresh
            </button>
          </div>

          {set?.planningInputs.preSelectedFromMemory && (
            <p className="text-[11px] text-muted-foreground">
              Pre-selected from your saved preference. It still needs explicit confirmation before any
              economic use.
            </p>
          )}

          {error && <p className="text-[11px] text-destructive">{error}</p>}
          {set?.notice && <p className="text-[11px] text-muted-foreground">{set.notice}</p>}
          {set?.stale && <p className="text-[11px] text-amber-500">{set.staleReason}</p>}

          {set?.scenarios.map((s) => {
            const recommended = s.scenarioId === set.recommendedScenarioId;
            return (
              <article
                key={s.scenarioId}
                className={`rounded-xl border p-3 ${
                  recommended ? "border-primary/50 bg-primary/[0.04]" : "border-hairline bg-card"
                }`}
              >
                <header className="mb-1.5 flex items-center gap-2">
                  <h3 className="min-w-0 flex-1 truncate font-mono text-[12px] font-black uppercase tracking-[0.1em]">
                    {s.label}
                  </h3>
                  {recommended && (
                    <span className="rounded-md bg-primary/12 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-primary">
                      Suggested
                    </span>
                  )}
                </header>

                <p className="text-[12px] text-foreground/90">{s.whatChanges}</p>
                <p className="mt-1 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                  <Droplets className="mt-0.5 h-3 w-3 shrink-0" />
                  {s.liquidityNote}
                </p>
                <p className="mt-1 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                  <Wallet className="mt-0.5 h-3 w-3 shrink-0" />
                  {s.expectedWalletConfirmations === 0
                    ? "No wallet confirmation needed."
                    : `${s.expectedWalletConfirmations} wallet confirmation${
                        s.expectedWalletConfirmations > 1 ? "s" : ""
                      }: ${s.expectedWalletConfirmationLabels.join(" → ")}`}
                </p>

                {s.blockers.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {s.blockers.map((b) => (
                      <li key={b} className="text-[11px] text-destructive">
                        {b}
                      </li>
                    ))}
                  </ul>
                )}

                <details className="mt-2">
                  <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    Evidence & assumptions
                  </summary>
                  <div className="mt-2 space-y-2">
                    {s.exactFacts.length > 0 && (
                      <div>
                        <p className="flex items-center gap-1 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-primary">
                          <ShieldCheck className="h-3 w-3" /> Canonical exact
                        </p>
                        {s.exactFacts.map((f) => (
                          <p key={f.label} className="text-[11px] text-muted-foreground">
                            {f.label}: {f.value}
                            {f.unit ? ` ${f.unit}` : ""}
                          </p>
                        ))}
                      </div>
                    )}
                    {s.estimatedFacts.length > 0 && (
                      <div>
                        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-amber-500">
                          Preview estimate — not executable
                        </p>
                        {s.estimatedFacts.map((f) => (
                          <p key={f.label} className="text-[11px] text-muted-foreground">
                            {f.label}: {f.value}
                            {f.unit ? ` ${f.unit}` : ""}
                          </p>
                        ))}
                      </div>
                    )}
                    {s.unresolvedExecutionValues.length > 0 && (
                      <div>
                        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                          Unknown until settlement
                        </p>
                        {s.unresolvedExecutionValues.map((u) => (
                          <p key={u} className="text-[11px] text-muted-foreground">
                            {u}
                          </p>
                        ))}
                      </div>
                    )}
                    {s.assumptions.map((a) => (
                      <p key={a} className="text-[11px] text-muted-foreground">
                        {a}
                      </p>
                    ))}
                    {s.prerequisites.length > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        Prerequisites: {s.prerequisites.join(" ")}
                      </p>
                    )}
                    <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                      Freshness {s.freshness} · snapshot {set.snapshot.snapshotId}
                    </p>
                  </div>
                </details>
              </article>
            );
          })}

          {set?.recommendationReason && (
            <p className="text-[11px] text-muted-foreground">{set.recommendationReason}</p>
          )}

          <p className="border-t border-hairline pt-2 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
            Simulation only · 0 missions · 0 action intents · 0 signatures. Building a mission stays a
            separate explicit step that re-checks canonical state.
          </p>
        </div>
      )}
    </section>
  );
}
