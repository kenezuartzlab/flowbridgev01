/**
 * B1 Gate 2 — pure/repository-level deterministic settlement.
 *
 * NOTE: this gate deliberately contains NO trusted production server adapter and
 * is NOT wired into /api/public/activity/verify. Settlement handoff is Gate 3.
 *
 * Campaign PTS awarded here is separate from FLOW and from
 * legacy `profiles.flow_points`. Never write it into legacy reward fields.
 */
import type { Hex } from '../activity/activityIntent';
import { evaluateCampaign } from './campaignEngine';
import type { CampaignCompletionRepository } from './campaignCompletionRepository';
import type { Campaign, CampaignCompletionPlan, CampaignTask, VerifiedActivityFacts } from './campaignTypes';

export interface SettlementResult {
  /** Completions newly inserted by this run. */
  inserted: CampaignCompletionPlan[];
  /** Completions the engine planned but that already existed (replay). */
  skipped: CampaignCompletionPlan[];
  /** Campaign PTS awarded for newly inserted completions only. */
  pointsAwarded: number;
}

export async function settleCampaignForWallet(args: {
  campaign: Campaign;
  tasks: CampaignTask[];
  wallet: string;
  activities: VerifiedActivityFacts[];
  repository: CampaignCompletionRepository;
  now?: () => number;
}): Promise<SettlementResult> {
  const { campaign, tasks, wallet, activities, repository } = args;
  const now = args.now ?? (() => Date.now());

  const existing = await repository.loadState({
    campaignId: campaign.campaignId as Hex,
    wallet,
  });

  const { completions } = evaluateCampaign({ campaign, tasks, wallet, activities, existing });

  const inserted: CampaignCompletionPlan[] = [];
  const skipped: CampaignCompletionPlan[] = [];
  let pointsAwarded = 0;

  for (const completion of completions) {
    const res = await repository.insertCompletion({ completion, completedAt: now() });
    if (res.inserted) {
      inserted.push(completion);
      pointsAwarded += res.pointsAwarded;
    } else {
      skipped.push(completion);
    }
  }

  return { inserted, skipped, pointsAwarded };
}
