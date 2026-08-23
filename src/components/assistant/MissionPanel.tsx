/**
 * FlowBridge V17 §6 — the mission surface.
 *
 * Shows the goal, the typed step graph, what is next, what is blocked and how
 * many wallet confirmations the user should still expect. Copy never implies
 * automation: Flow AI plans and prepares, the user signs.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Loader2,
  Lock,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { ActionIntentCard, type PreparedIntentPayload } from "./ActionIntentCard";
import {
  listMissions,
  missionAction,
  type MissionActionResponse,
} from "@/lib/ai/mission/missionClient";
import { missionProgress, type Mission, type MissionStep } from "@/lib/ai/mission/missionTypes";

const STATE_ICON: Record<string, ReactNode> = {
  COMPLETED: <CheckCircle2 className="h-3.5 w-3.5 text-success" />,
  WAITING_FOR_USER: <Lock className="h-3.5 w-3.5 text-primary" />,
  WAITING_FOR_CONFIRMATION: <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />,
  BLOCKED: <X className="h-3.5 w-3.5 text-danger" />,
};

function StepRow({ step, isNext }: { step: MissionStep; isNext: boolean }) {
  return (
    <li
      className={`flex items-start gap-2.5 px-3.5 py-2.5 ${isNext ? "bg-primary/5" : ""}`}
      data-testid="mission-step"
    >
      <span className="mt-[2px] shrink-0">
        {STATE_ICON[step.state] ?? <CircleDashed className="h-3.5 w-3.5 text-muted" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[11.5px] font-black uppercase tracking-[0.05em]">
          {step.title}
        </p>
        <p className="font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">
          {step.state.replace(/_/g, " ")}
          {step.requiresWalletSignature ? " · your wallet signs" : ""}
          {step.amountUnresolved && !step.outputs.resolvedAmount
            ? " · amount unresolved until confirmed"
            : ""}
        </p>
        {step.blockingReason && (
          <p className="mt-1 font-mono text-[10px] leading-relaxed text-danger">
            {step.blockingReason}
          </p>
        )}
      </div>
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
              <div className="border-b border-hairline px-3.5 py-2.5">
                <p className="font-mono text-[11.5px] font-black uppercase tracking-[0.05em]">
                  {active.goalText}
                </p>
                <p className="font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">
                  {active.status} · {missionProgress(active).completed}/{missionProgress(active).total} steps ·{" "}
                  {missionProgress(active).expectedUserConfirmations} wallet confirmations expected
                </p>
                {active.goal.missingSlots.length > 0 && (
                  <p className="mt-1 font-mono text-[10px] text-muted">
                    Missing: {active.goal.missingSlots.join(", ")} — tell me the exact amount and I'll
                    plan it; I never pick one for you.
                  </p>
                )}
              </div>
              <ul className="divide-y divide-hairline">
                {active.steps.map((s) => (
                  <StepRow key={s.id} step={s} isNext={s.id === active.currentStepId} />
                ))}
              </ul>
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

          <p className="font-mono text-[9.5px] leading-relaxed text-muted">
            Missions plan and prepare only. Flow AI cannot sign, submit, approve or continue a step
            for you, and a step advances only from canonical verified settlement.
          </p>
        </div>
      )}
    </section>
  );
}
