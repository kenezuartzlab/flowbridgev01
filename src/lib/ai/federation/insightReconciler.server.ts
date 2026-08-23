/**
 * FlowBridge V20 §2 — SERVER-ONLY canonical reconciliation path.
 *
 * The only way a federated insight can become an opportunity: the canonical V16
 * engine is re-run for the AUTHENTICATED actor, independently of anything the
 * provider said, and the reconciler then does a lookup against that canonical
 * feed. No client-supplied wallet, amount, chain or target is accepted, and this
 * function writes nothing — no mission, no ActionIntent, no economic record.
 */
import type { FlowAiActor } from "../aiTypes";
import type { CandidateInsight } from "./candidateInsight";
import { reconcileCandidateInsight, type ReconciledInsight } from "./insightReconciler";

export async function reconcileFederatedInsight(input: {
  actor: FlowAiActor;
  candidate: CandidateInsight;
  now?: Date;
}): Promise<ReconciledInsight> {
  const now = input.now ?? new Date();
  const { generateOpportunityFeed } = await import("../opportunity/opportunityEngine.server");

  const feed = await generateOpportunityFeed({ actor: input.actor, limit: 8, now });

  /** Canonical plan-shape input only: never an amount, rate or balance. */
  const stakingAvailable =
    !feed.degradedDomains.includes("STAKING") &&
    !feed.items.some((i) => i.domain === "STAKING" && i.type === "VAULT_PAUSED");

  return reconcileCandidateInsight({
    candidate: input.candidate,
    canonicalItems: feed.items,
    degradedDomains: feed.degradedDomains,
    stakingAvailable,
    now,
  });
}
