import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  isFailureOutcome,
  sanitizeDiagnosticDetail,
  type RewardDiagnosticOutcome,
} from "./rewardDiagnostics";

/** Record an internal (server-only) reward diagnostic. Never throws. */
export async function recordRewardDiagnostic(input: {
  stage: string;
  outcome: RewardDiagnosticOutcome;
  chainId?: number | null;
  txHash?: string | null;
  detail?: string | null;
}) {
  const detail = sanitizeDiagnosticDetail(input.detail);
  const line = `[reward-diagnostic] ${input.stage} ${input.outcome} chain=${input.chainId ?? "-"} tx=${input.txHash ?? "-"}${detail ? ` ${detail}` : ""}`;
  if (isFailureOutcome(input.outcome)) console.error(line);
  else console.info(line);
  try {
    const { error } = await supabaseAdmin.from("reward_processing_events").insert({
      stage: input.stage,
      outcome: input.outcome,
      chain_id: input.chainId ?? null,
      tx_hash: input.txHash?.toLowerCase() ?? null,
      detail,
    } as never);
    if (error) console.error("[reward-diagnostic] diagnostic write failed", error.code);
  } catch {
    console.error("[reward-diagnostic] diagnostic write threw");
  }
}
