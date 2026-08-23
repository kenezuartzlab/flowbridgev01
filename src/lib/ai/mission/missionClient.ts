/**
 * FlowBridge V17 — browser client for the Mission Orchestrator.
 *
 * Read/plan only. The client can ask the server to plan, prepare, advance or
 * edit a mission; it can never execute one. Every economic confirmation happens
 * in the linked product surface with the user's own wallet.
 */
import { supabase } from "@/integrations/supabase/client";
import type { PreparedIntentPayload } from "@/components/assistant/ActionIntentCard";
import type {
  Mission,
  MissionConversionConfirmation,
  MissionFailureClass,
  MissionStep,
} from "./missionTypes";
import type { EditPreview } from "./missionPlanner";
import type { MissionRecoveryAdvice } from "./missionProgress";
import type { CanonicalStakeHandoff, StakeHandoffFailure } from "./stakeHandoff";


async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface MissionActionResponse {
  success?: boolean;
  error?: string;
  mission?: Mission;
  missions?: Mission[];
  step?: MissionStep | null;
  prepared?: PreparedIntentPayload | null;
  preview?: EditPreview;
  failureClass?: MissionFailureClass | null;
  recovery?: MissionRecoveryAdvice | null;
  advanced?: boolean;
  message?: string;
  /** V18 §5 — machine-readable compile outcome. */
  code?: string;
  template?: {
    id: string;
    version: string;
    outcome: string;
    goalText: string;
    summary: string;
    stakePortionPercent: number | null;
    requiresUserInput: readonly string[];
  } | null;
  /** V17.1B §5 — explicit off-chain conversion confirmation payload. */
  conversionConfirmation?: MissionConversionConfirmation | null;
  /** V17.1B §2 — canonical reward state resolved server-side. */
  rewardState?: {
    flowPointsTotal: number;
    convertibleFlowPoints: number;
    claimableFlow: number | null;
    claimedFlow: number | null;
    walletFlow: number | null;
    nextEconomicStep: "CLAIM_FLOW" | "CONVERT_FLOW_POINTS" | "NONE";
    copy: { nextAction: string; readiness: string };
  } | null;
  converted?: boolean;
  convertedFlowPoints?: number;
  /** V17.1C §1 — the step is already prepared; nothing was re-prepared. */
  frozen?: boolean;
  /** V17.1C §2 — opaque correlation for the review surface (no economics). */
  correlation?: { missionId: string; stepId: string; intentId: string | null } | null;
  /** V17.1E §3 — canonical, server-resolved stake handoff (or its failure). */
  stakeHandoff?: CanonicalStakeHandoff | null;
  stakeHandoffFailure?: StakeHandoffFailure | null;
}

/**
 * V17.1E §3 — asks the server to resolve a mission stake handoff. The client
 * sends opaque correlation only; the amount, actor wallet, chain and vault come
 * back re-derived from the mission's own state.
 */
export async function resolveStakeHandoffFromServer(correlation: {
  missionId: string;
  stepId: string;
  intentId: string | null;
}): Promise<MissionActionResponse> {
  return missionAction({
    action: "stake-handoff",
    missionId: correlation.missionId,
    stepId: correlation.stepId,
    intentId: correlation.intentId,
  });
}



/**
 * V18 §3 — explicit user initiation of a plan from a canonical opportunity.
 * Sends the opportunity identity only; the server re-resolves the economics,
 * chooses the typed template and owns deduplication. No transaction is sent.
 */
export async function compileOpportunityIntoMission(
  opportunityId: string,
): Promise<MissionActionResponse> {
  return missionAction({ action: "compile-opportunity", opportunityId });
}

export async function listMissions(): Promise<Mission[]> {
  const res = await fetch("/api/missions", { headers: await authHeaders() });
  const json = (await res.json()) as MissionActionResponse;
  return json.missions ?? [];
}

export async function missionAction(
  body: Record<string, unknown>,
): Promise<MissionActionResponse> {
  const res = await fetch("/api/missions", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  return (await res.json()) as MissionActionResponse;
}
