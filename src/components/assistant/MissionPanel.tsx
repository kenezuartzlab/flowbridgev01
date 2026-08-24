/**
 * FlowBridge V17 §6 + V25 §5/§6 — the mission surface as a narrative.
 *
 * The first frame answers three questions only: what is done, what is happening
 * now, what comes next. The typed step graph still exists and is one tap away,
 * but it is no longer the default reading. Copy never implies automation: Flow AI
 * plans and prepares, the user signs.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { ActionIntentCard, type PreparedIntentPayload } from "./ActionIntentCard";
import {
  listMissions,
  missionAction,
  type MissionActionResponse,
} from "@/lib/ai/mission/missionClient";
import { missionProgress, type Mission, type MissionStep } from "@/lib/ai/mission/missionTypes";
import {
  completionSummary,
  missionNarrative,
  stepDetail,
  stepStatus,
} from "@/lib/ai/experience/missionNarrative";
import { StatusChip } from "@/components/ai/StatusChip";

function StepRow({
  step,
  isNext,
  emphasis = false,
  caption,
}: {
  step: MissionStep;
  isNext: boolean;
  emphasis?: boolean;
  caption?: string;
}) {
  return (
    <li
      className={`px-3.5 py-2.5 ${isNext ? "bg-primary/5" : ""}`}
      data-testid="mission-step"
    >
      {caption && (
        <p className="mb-1 font-mono text-[9px] font-black uppercase tracking-[0.12em] text-muted">
          {caption}
        </p>
      )}
      <div className="flex items-start gap-2.5">
        <StatusChip status={stepStatus(step)} className="mt-[2px] shrink-0" />
        <div className="min-w-0 flex-1">
          <p
            className={`font-mono font-black uppercase tracking-[0.05em] ${emphasis ? "text-[12.5px]" : "text-[11.5px]"}`}
          >
            {step.title}
          </p>
          {/* V25 §5 — unknown amounts are stated honestly, never estimated. */}
          <p className="font-mono text-[10px] leading-relaxed text-muted">{stepDetail(step)}</p>
        </div>
      </div>
    </li>
  );
}


/**
 * V17.1F §4/§6 — a terminal mission rendered as read-only history: outcome,
 * completion time and the transaction evidence that closed each economic step.
 * There are no action controls here; history can never be resumed or replayed.
 */
function HistoryRow({ mission }: { mission: Mission }) {
  const p = missionProgress(mission);
  /** Canonical settlement evidence lives on the step's linked tx hash. */
  const evidence = mission.steps.filter((s) => s.linkedTxHash || s.outputs?.txHash);
  const completed = mission.completedAt ?? mission.updatedAt;
  const settlementWallet = mission.steps
    .map((s) => s.outputs?.settlementWallet)
    .find((w): w is string => typeof w === "string");
  const derivation = mission.steps
    .map((s) => s.outputs?.derivation as { derivedAmount?: string; ratioPercent?: number; sourceKind?: string } | undefined)
    .find((d) => d?.derivedAmount);
  return (
    <li className="px-3.5 py-2.5" data-testid="mission-history-item">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 font-mono text-[11px] font-black uppercase tracking-[0.05em]">
          {mission.goalText}
        </p>
        <span
          className={`shrink-0 font-mono text-[9px] font-black uppercase tracking-[0.08em] ${
            mission.status === "COMPLETED" ? "text-success" : "text-muted"
          }`}
        >
          {mission.status}
        </span>
      </div>
      <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">
        {p.completed}/{p.total} steps ·{" "}
        {completed ? new Date(completed).toLocaleString("en-US") : "time unavailable"}
      </p>
      {mission.source && (
        <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">
          Built from your insight · {mission.source.opportunityKind.toLowerCase()} · template{" "}
          {mission.source.templateId}
        </p>
      )}
      {(settlementWallet || derivation) && (
        <p className="mt-0.5 break-all font-mono text-[9.5px] text-muted">
          {settlementWallet ? `${settlementWallet} · chain ${mission.goal.chainId}` : null}
          {derivation
            ? ` · derived ${derivation.derivedAmount} FLOW (${derivation.ratioPercent ?? "?"}% of ${derivation.sourceKind ?? "verified result"})`
            : null}
        </p>
      )}
      {evidence.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {evidence.map((s) => {
            const tx = String(s.linkedTxHash ?? s.outputs?.txHash ?? "");
            return (
              <li key={s.id} className="font-mono text-[9.5px] text-muted">
                {s.title}
                {s.outputs?.resolvedAmount ? ` · ${String(s.outputs.resolvedAmount)}` : ""} ·{" "}
                {tx.slice(0, 10)}…{tx.slice(-8)}
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}


export function MissionPanel({ initialGoalText = "" }: { initialGoalText?: string }) {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [goalText, setGoalText] = useState(initialGoalText);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<PreparedIntentPayload | null>(null);
  /**
   * V17.1B §5 — an off-chain conversion is NEVER implicit. The server hands back
   * a confirmation payload and nothing happens until the user accepts it here.
   */
  const [conversion, setConversion] = useState<
    NonNullable<MissionActionResponse["conversionConfirmation"]> | null
  >(null);
  const [rewardState, setRewardState] = useState<MissionActionResponse["rewardState"]>(null);
  /** V17.1C §2 — opaque correlation handed to the review surface with the plan. */
  const [correlation, setCorrelation] = useState<MissionActionResponse["correlation"]>(null);
  const [open, setOpen] = useState(true);


  const refresh = useCallback(async () => {
    setMissions(await listMissions());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const active = missions.find((m) => m.status !== "CANCELLED" && m.status !== "COMPLETED") ?? null;
  /**
   * V17.1F §4/§6 — completion is history, not disappearance. Terminal missions
   * stay visible, read-only, with their evidence, and are never re-openable.
   */
  const history = missions.filter((m) => m.status === "COMPLETED" || m.status === "CANCELLED");
  const [historyOpen, setHistoryOpen] = useState(false);

  /**
   * V17.1B §8 — when the canonical reward state says there is no eligible
   * economic action, the CTA is disabled instead of preparing an empty claim.
   */
  const rewardOnlyMission =
    !!active &&
    active.steps.every((s) =>
      ["PREPARE_CLAIM", "CONVERT_FLOW_POINTS", "AWAIT_SETTLEMENT", "VERIFY"].includes(s.type),
    );
  const noEligibleAction = rewardOnlyMission && rewardState?.nextEconomicStep === "NONE";

  const run = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setMessage(null);
      try {
        const res = await missionAction(body);
        if (res.error) setMessage(res.error);
        else setMessage(res.message ?? null);
        if (res.prepared) setPrepared(res.prepared);
        if (res.correlation !== undefined) setCorrelation(res.correlation);
        if (res.conversionConfirmation !== undefined) setConversion(res.conversionConfirmation);
        if (res.rewardState !== undefined) setRewardState(res.rewardState);
        await refresh();

      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  return (
    <section className="fb-surface overflow-hidden" data-testid="mission-panel">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 border-b border-hairline px-4 py-3 text-left"
      >
        <span className="fb-eyebrow flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" /> Missions — plan only
        </span>
        <ChevronDown className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-3 p-3.5">
          <div className="space-y-2">
            <input
              value={goalText}
              onChange={(e) => setGoalText(e.target.value)}
              placeholder="Describe an outcome, e.g. swap 20 USDT to BOT and stake it"
              className="w-full rounded-xl border border-hairline bg-card px-3 py-2 font-mono text-[11.5px] outline-none focus:border-primary/50"
            />
            <button
              type="button"
              disabled={busy || goalText.trim().length < 6}
              onClick={() => void run({ action: "create", goalText })}
              className="w-full rounded-xl bg-primary px-3 py-2 font-mono text-[10.5px] font-black uppercase tracking-[0.1em] text-primary-foreground disabled:opacity-50"
            >
              Plan this mission
            </button>
          </div>

          {active && (
            <div className="fb-inset overflow-hidden rounded-xl">
              {(() => {
                const n = missionNarrative(active);
                return (
                  <>
                    <div className="border-b border-hairline px-3.5 py-2.5">
                      <p className="font-mono text-[11.5px] font-black uppercase tracking-[0.05em]">
                        {active.goalText}
                      </p>
                      {/* V25 §5 — progress in words first, numbers second. */}
                      <p className="mt-0.5 font-mono text-[10.5px] leading-relaxed text-muted">
                        {n.current
                          ? n.blocked
                            ? "One thing is holding this up."
                            : `Now: ${n.current.title}.`
                          : "Every step is done."}
                        {n.next ? ` Then: ${n.next.title}.` : ""}
                      </p>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-foreground/8">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${n.percent}%` }}
                        />
                      </div>
                      <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">
                        {n.completedCount}/{n.totalCount} done ·{" "}
                        {n.expectedUserConfirmations === 0
                          ? "no wallet confirmation left"
                          : `${n.expectedUserConfirmations} wallet confirmation${n.expectedUserConfirmations === 1 ? "" : "s"} still yours to approve`}
                      </p>
                      {active.source && (
                        <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">
                          Built from your insight · {active.source.opportunityKind.toLowerCase()} ·
                          template {active.source.templateId} {active.source.templateVersion}
                        </p>
                      )}
                      {active.goal.missingSlots.length > 0 && (
                        <p className="mt-1 font-mono text-[10px] text-muted">
                          Missing: {active.goal.missingSlots.join(", ")} — tell me the exact amount
                          and I'll plan it; I never pick one for you.
                        </p>
                      )}
                    </div>

                    {/* The narrative frame: current step, then what follows. */}
                    <ul className="divide-y divide-hairline">
                      {n.current && (
                        <StepRow
                          step={n.current}
                          isNext
                          emphasis
                          caption={n.blocked ? "Needs attention" : "Happening now"}
                        />
                      )}
                      {n.next && <StepRow step={n.next} isNext={false} caption="Next" />}
                    </ul>

                    {/* §5 — the full typed graph stays available, one tap away. */}
                    <button
                      type="button"
                      onClick={() => setStepsOpen((v) => !v)}
                      aria-expanded={stepsOpen}
                      className="flex w-full items-center justify-between border-t border-hairline px-3.5 py-2 text-left font-mono text-[9.5px] font-black uppercase tracking-[0.1em] text-muted"
                    >
                      All {n.totalCount} steps
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform ${stepsOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                    {stepsOpen && (
                      <ul className="divide-y divide-hairline border-t border-hairline">
                        {active.steps.map((s) => (
                          <StepRow key={s.id} step={s} isNext={s.id === active.currentStepId} />
                        ))}
                      </ul>
                    )}
                  </>
                );
              })()}

              <div className="flex flex-wrap gap-2 border-t border-hairline p-3">
                <button
                  type="button"
                  disabled={busy || noEligibleAction}
                  title={noEligibleAction ? rewardState?.copy.readiness : undefined}
                  onClick={() => void run({ action: "prepare-next", missionId: active.id })}
                  className="rounded-lg bg-primary px-3 py-1.5 font-mono text-[10px] font-black uppercase tracking-[0.08em] text-primary-foreground disabled:opacity-50"
                  data-testid="mission-prepare-next"
                >
                  Prepare next step
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run({ action: "advance", missionId: active.id })}
                  className="rounded-lg border border-hairline px-3 py-1.5 font-mono text-[10px] font-black uppercase tracking-[0.08em] text-muted disabled:opacity-50"
                >
                  Check confirmation
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run({
                      action: active.status === "PAUSED" ? "resume" : "pause",
                      missionId: active.id,
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-hairline px-3 py-1.5 font-mono text-[10px] font-black uppercase tracking-[0.08em] text-muted disabled:opacity-50"
                >
                  {active.status === "PAUSED" ? (
                    <Play className="h-3 w-3" />
                  ) : (
                    <Pause className="h-3 w-3" />
                  )}
                  {active.status === "PAUSED" ? "Resume" : "Pause"}
                </button>
                {active.currentStepId && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run({ action: "retry", missionId: active.id, stepId: active.currentStepId })
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-hairline px-3 py-1.5 font-mono text-[10px] font-black uppercase tracking-[0.08em] text-muted disabled:opacity-50"
                  >
                    <RotateCcw className="h-3 w-3" /> Retry preparation
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run({ action: "cancel", missionId: active.id })}
                  className="rounded-lg border border-hairline px-3 py-1.5 font-mono text-[10px] font-black uppercase tracking-[0.08em] text-muted disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {message && (
            <p className="font-mono text-[10.5px] leading-relaxed text-muted">{message}</p>
          )}

          {conversion && (
            <div className="fb-inset space-y-2.5 rounded-xl p-3.5" data-testid="conversion-confirmation">
              <p className="font-mono text-[11.5px] font-black uppercase tracking-[0.05em]">
                {conversion.title}
              </p>
              <p className="font-mono text-[10.5px] leading-relaxed text-muted">{conversion.body}</p>
              <ul className="space-y-1">
                {conversion.requirements.map((r) => (
                  <li
                    key={r.id}
                    className={`font-mono text-[10px] uppercase tracking-[0.06em] ${
                      r.met ? "text-success" : "text-danger"
                    }`}
                  >
                    {r.met ? "✓" : "✗"} {r.label}
                    {!r.met && r.hint ? ` — ${r.hint}` : ""}
                  </li>
                ))}
              </ul>
              <p className="font-mono text-[9.5px] leading-relaxed text-muted">
                Confirming authorizes the off-chain conversion only. It moves no tokens and signs
                nothing; the on-chain claim stays a separate wallet confirmation you control.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || conversion.requirements.some((r) => !r.met)}
                  onClick={() =>
                    void run({
                      action: "convert-confirm",
                      missionId: active?.id,
                      stepId: conversion.stepId,
                      confirm: true,
                      expectedConvertibleFlowPoints: conversion.convertibleFlowPoints,
                    })
                  }
                  className="rounded-lg bg-primary px-3 py-1.5 font-mono text-[10px] font-black uppercase tracking-[0.08em] text-primary-foreground disabled:opacity-50"
                  data-testid="conversion-confirm"
                >
                  Convert {conversion.convertibleFlowPoints.toLocaleString("en-US")} PTS
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConversion(null)}
                  className="rounded-lg border border-hairline px-3 py-1.5 font-mono text-[10px] font-black uppercase tracking-[0.08em] text-muted disabled:opacity-50"
                >
                  Not now
                </button>
              </div>
            </div>
          )}

          {rewardState && (
            <p className="font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">
              {rewardState.copy.readiness}
            </p>
          )}

          {prepared && <ActionIntentCard payload={prepared} correlation={correlation} />}

          {history.length > 0 && (
            <div className="fb-inset overflow-hidden rounded-xl" data-testid="mission-history">
              <button
                type="button"
                onClick={() => setHistoryOpen((v) => !v)}
                className="flex w-full items-center justify-between px-3.5 py-2.5 text-left"
              >
                <span className="font-mono text-[10px] font-black uppercase tracking-[0.08em] text-muted">
                  Mission history ({history.length})
                </span>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-muted transition-transform ${historyOpen ? "rotate-180" : ""}`}
                />
              </button>
              {historyOpen && (
                <>
                  <ul className="divide-y divide-hairline border-t border-hairline">
                    {history.map((m) => (
                      <HistoryRow key={m.id} mission={m} />
                    ))}
                  </ul>
                  <p className="border-t border-hairline px-3.5 py-2 font-mono text-[9px] leading-relaxed text-muted">
                    Completed missions are permanent read-only records. They keep their verified
                    transaction evidence and can never be resumed, replayed or reopened.
                  </p>
                </>
              )}
            </div>
          )}

          <p className="font-mono text-[9.5px] leading-relaxed text-muted">
            Missions plan and prepare only. Flow AI cannot sign, submit, approve or continue a step
            for you, and a step advances only from canonical verified settlement.
          </p>
        </div>
      )}
    </section>
  );
}
