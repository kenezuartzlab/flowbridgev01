/**
 * B1 Gate 2 — deterministic campaign evaluation engine.
 *
 * Guarantees:
 *  - CONFIRMED verified activity only (PENDING/REVIEW/REVERSED never counts).
 *  - Wallet-bound: an activity can only satisfy its own wallet.
 *  - Replay-safe: an activity is consumed at most once per campaign+task+wallet.
 *  - Completion-limit aware per wallet.
 *  - No FLOW award, no Activity Registry write, no randomness, no Date.now()
 *    inside identity derivation.
 */
import { encodeAbiParameters, keccak256, toHex } from 'viem';
import type { Hex } from '../activity/activityIntent';
import { allRulesMatch } from './campaignRules';
import type {
  Campaign,
  CampaignCompletionPlan,
  CampaignTask,
  VerifiedActivityFacts,
} from './campaignTypes';

/** Deterministic id: keccak(abi.encode(campaignId, keccak(taskId), wallet, sortedActivityIds)) */
export function campaignCompletionId(args: {
  campaignId: Hex;
  taskId: string;
  wallet: string;
  activityIds: Hex[];
}): Hex {
  const sorted = sortActivityIds(args.activityIds);
  return keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'address' }, { type: 'bytes32[]' }],
      [
        args.campaignId.toLowerCase() as Hex,
        keccak256(toHex(args.taskId)),
        args.wallet.toLowerCase() as Hex,
        sorted,
      ],
    ),
  );
}

export function sortActivityIds(ids: Hex[]): Hex[] {
  const unique = [...new Set(ids.map((id) => id.toLowerCase() as Hex))];
  return unique.sort();
}

export interface ExistingCompletionState {
  /** Completions already recorded for this wallet, keyed by taskId. */
  countByTaskId: Record<string, number>;
  /** Activity ids already consumed, keyed by taskId (lowercased ids). */
  usedActivityIdsByTaskId: Record<string, string[]>;
}

export const emptyCompletionState = (): ExistingCompletionState => ({
  countByTaskId: {},
  usedActivityIdsByTaskId: {},
});

function withinWindow(campaign: Campaign, facts: VerifiedActivityFacts): boolean {
  // Windowed campaigns require a trusted occurredAt: fail closed when absent.
  if (facts.occurredAt === undefined) return false;
  return facts.occurredAt >= campaign.startsAt && facts.occurredAt <= campaign.endsAt;
}

export function activityQualifies(args: {
  campaign: Campaign;
  task: CampaignTask;
  wallet: string;
  facts: VerifiedActivityFacts;
}): boolean {
  const { campaign, task, wallet, facts } = args;
  if (facts.status !== 'CONFIRMED') return false;
  if (facts.wallet.toLowerCase() !== wallet.toLowerCase()) return false;
  if (!withinWindow(campaign, facts)) return false;
  return allRulesMatch(task.rules, facts);
}

export interface EvaluateCampaignResult {
  completions: CampaignCompletionPlan[];
  /** Sum of Campaign PTS for the NEW completions in this plan only. */
  pointsPlanned: number;
}

/**
 * Pure evaluation: returns the new completions for a wallet given the campaign,
 * its tasks and the wallet's confirmed verified activity (historical included).
 */
export function evaluateCampaign(args: {
  campaign: Campaign;
  tasks: CampaignTask[];
  wallet: string;
  activities: VerifiedActivityFacts[];
  existing?: ExistingCompletionState;
}): EvaluateCampaignResult {
  const { campaign, wallet, activities } = args;
  const existing = args.existing ?? emptyCompletionState();
  const completions: CampaignCompletionPlan[] = [];

  if (campaign.status !== 'published') return { completions, pointsPlanned: 0 };

  const tasks = [...args.tasks].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.taskId.localeCompare(b.taskId),
  );

  for (const task of tasks) {
    const requiredCount = Math.max(1, Math.trunc(task.requiredCount));
    const limit = Math.max(0, Math.trunc(task.completionLimitPerWallet));
    const already = existing.countByTaskId[task.taskId] ?? 0;
    let remaining = limit - already;
    if (remaining <= 0) continue;

    const used = new Set(
      (existing.usedActivityIdsByTaskId[task.taskId] ?? []).map((id) => id.toLowerCase()),
    );

    // Deterministic ordering: occurredAt then activityId.
    const eligible = activities
      .filter((facts) => !used.has(facts.activityId.toLowerCase()))
      .filter((facts) => activityQualifies({ campaign, task, wallet, facts }))
      .sort(
        (a, b) =>
          (a.occurredAt ?? 0) - (b.occurredAt ?? 0) ||
          a.activityId.toLowerCase().localeCompare(b.activityId.toLowerCase()),
      );

    const pool = [...new Map(eligible.map((f) => [f.activityId.toLowerCase(), f])).values()];

    let cursor = 0;
    while (remaining > 0 && pool.length - cursor >= requiredCount) {
      const slice = pool.slice(cursor, cursor + requiredCount);
      cursor += requiredCount;
      remaining -= 1;
      const activityIds = sortActivityIds(slice.map((f) => f.activityId));
      completions.push({
        completionId: campaignCompletionId({
          campaignId: campaign.campaignId,
          taskId: task.taskId,
          wallet,
          activityIds,
        }),
        campaignId: campaign.campaignId,
        taskId: task.taskId,
        wallet: wallet.toLowerCase(),
        activityIds,
        points: task.points,
      });
    }
  }

  return {
    completions,
    pointsPlanned: completions.reduce((sum, c) => sum + c.points, 0),
  };
}
