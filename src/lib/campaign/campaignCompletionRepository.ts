/**
 * B1 Gate 2 — completion persistence boundary.
 *
 * Insertion is idempotent on completionId: a replayed settlement returns
 * `inserted: false` and awards ZERO additional Campaign PTS.
 */
import type { Hex } from '../activity/activityIntent';
import type { CampaignCompletionPlan, CampaignCompletionRecord } from './campaignTypes';
import type { ExistingCompletionState } from './campaignEngine';

export interface CampaignCompletionRepository {
  /** Existing completion state for a wallet within one campaign. */
  loadState(args: { campaignId: Hex; wallet: string }): Promise<ExistingCompletionState>;
  /** Idempotent insert; points are awarded ONLY when inserted is true. */
  insertCompletion(args: {
    completion: CampaignCompletionPlan;
    completedAt: number;
  }): Promise<{ inserted: boolean; pointsAwarded: number }>;
  /** Total Campaign PTS for a wallet (never FLOW). */
  totalPoints(args: { wallet: string; campaignId?: Hex }): Promise<number>;
}

export function createInMemoryCampaignCompletionRepository(): CampaignCompletionRepository & {
  all(): CampaignCompletionRecord[];
} {
  const byId = new Map<string, CampaignCompletionRecord>();
  const key = (id: string) => id.toLowerCase();

  return {
    all: () => [...byId.values()],
    async loadState({ campaignId, wallet }) {
      const state: ExistingCompletionState = {
        countByTaskId: {},
        usedActivityIdsByTaskId: {},
      };
      for (const rec of byId.values()) {
        if (rec.campaignId.toLowerCase() !== campaignId.toLowerCase()) continue;
        if (rec.wallet.toLowerCase() !== wallet.toLowerCase()) continue;
        state.countByTaskId[rec.taskId] = (state.countByTaskId[rec.taskId] ?? 0) + 1;
        state.usedActivityIdsByTaskId[rec.taskId] = [
          ...(state.usedActivityIdsByTaskId[rec.taskId] ?? []),
          ...rec.activityIds.map((id) => id.toLowerCase()),
        ];
      }
      return state;
    },
    async insertCompletion({ completion, completedAt }) {
      const k = key(completion.completionId);
      if (byId.has(k)) return { inserted: false, pointsAwarded: 0 };
      byId.set(k, { ...completion, completedAt });
      return { inserted: true, pointsAwarded: completion.points };
    },
    async totalPoints({ wallet, campaignId }) {
      let total = 0;
      for (const rec of byId.values()) {
        if (rec.wallet.toLowerCase() !== wallet.toLowerCase()) continue;
        if (campaignId && rec.campaignId.toLowerCase() !== campaignId.toLowerCase()) continue;
        total += rec.points;
      }
      return total;
    },
  };
}
