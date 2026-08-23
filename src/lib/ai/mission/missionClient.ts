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
