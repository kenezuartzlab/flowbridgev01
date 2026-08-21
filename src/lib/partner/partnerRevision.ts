/**
 * FlowBridge V14.1 — immutable submission revisions (browser-safe, pure).
 *
 * A partner edits a mutable DRAFT. SUBMIT freezes a *snapshot* of that draft:
 * copy, schedule, organization identity, reward configuration, Campaign PTS
 * budget and the executable verified-activity rules. The snapshot is what a
 * reviewer sees, and the approved snapshot is the only thing ever materialized
 * into the canonical campaigns/campaign_tasks execution model.
 *
 * This module owns the *bounds*: partner-authored Campaign PTS can never be
 * unbounded, and rules must parse against the frozen canonical rule grammar.
 */
import { parseCampaignRule } from '@/lib/campaign/campaignRules';
import type { CampaignRewardType } from './partnerTypes';

/* ------------------------- Campaign PTS platform bounds ------------------- */

/** Server-enforced platform limits. Absent an explicit budget, publishing fails closed. */
export const PTS_LIMITS = {
  /** Max PTS a single task may award per completion. */
  maxTaskPts: 500,
  /** Max total Campaign PTS a partner campaign may ever issue. */
  maxCampaignBudget: 250_000,
  /** A campaign must declare a positive budget before it can be submitted. */
  minCampaignBudget: 1,
  /** Max tasks a partner campaign may hold. */
  maxTasks: 10,
  /** Max repeat completions per wallet per task. */
  maxCompletionLimitPerWallet: 25,
  /** Max submissions an organization may make per rolling hour (abuse control). */
  maxSubmissionsPerHour: 12,
} as const;

export interface RevisionTask {
  taskId: string;
  title: string;
  description?: string | null;
  points: number;
  requiredCount: number;
  completionLimitPerWallet: number;
  rules: unknown[];
  sortOrder: number;
}

export interface RevisionSnapshotInput {
  campaignId: string;
  organizationId: string;
  orgSlug: string;
  orgName: string;
  revision: number;
  slug: string;
  name: string;
  description?: string | null;
  startsAt: number;
  endsAt: number;
  rewardType: CampaignRewardType;
  ptsBudget: number;
  tasks: RevisionTask[];
}

export type CampaignRevisionSnapshot = RevisionSnapshotInput;

export type RevisionStatus =
  | 'submitted'
  | 'changes_requested'
  | 'approved'
  | 'published'
  | 'superseded'
  | 'withdrawn'
  | 'ended';

export interface CampaignRevisionRecord {
  revisionId: string;
  campaignId: string;
  organizationId: string;
  revision: number;
  status: RevisionStatus;
  fingerprint: string;
  snapshot: CampaignRevisionSnapshot;
  submittedAt: number;
  reviewedAt?: number | null;
  reviewNote?: string | null;
  publishedAt?: number | null;
}

/* ------------------------------- validation ------------------------------- */

/**
 * Executable-rule validation. Partner free text may describe a quest, but only
 * canonical rule types can become verification logic; anything else rejects.
 */
export function validateRevisionRules(tasks: RevisionTask[]): string[] {
  const errors: string[] = [];
  tasks.forEach((task, i) => {
    const label = task.title?.trim() || `Task ${i + 1}`;
    if (!Array.isArray(task.rules) || task.rules.length === 0) {
      errors.push(`${label}: add at least one verified-activity rule.`);
      return;
    }
    if (task.rules.length > 8) errors.push(`${label}: at most 8 rules per task.`);
    task.rules.forEach((rule, j) => {
      try {
        parseCampaignRule(rule);
      } catch (e: any) {
        errors.push(`${label}: rule ${j + 1} rejected — ${e?.message ?? 'unsupported rule'}.`);
      }
    });
  });
  return errors;
}

/** Campaign PTS budget/bounds. Fails closed: no bound => no submission. */
export function validatePtsBudget(input: {
  rewardType: CampaignRewardType;
  ptsBudget: number;
  tasks: RevisionTask[];
}): string[] {
  const errors: string[] = [];
  const isPts = input.rewardType === 'campaign_pts';
  const budget = Number(input.ptsBudget);

  if (input.tasks.length > PTS_LIMITS.maxTasks) {
    errors.push(`A partner campaign may hold at most ${PTS_LIMITS.maxTasks} tasks.`);
  }

  if (!isPts) {
    if (budget !== 0 || input.tasks.some((t) => Number(t.points) > 0)) {
      errors.push(
        'Only Campaign PTS carries reward authority in this release. Keep PTS and budget at 0 for a reward request.',
      );
    }
    return errors;
  }

  if (!Number.isInteger(budget) || budget < PTS_LIMITS.minCampaignBudget) {
    errors.push('Declare a whole-number Campaign PTS budget of 1 or more before submitting.');
  } else if (budget > PTS_LIMITS.maxCampaignBudget) {
    errors.push(
      `Campaign PTS budget exceeds the platform limit of ${PTS_LIMITS.maxCampaignBudget.toLocaleString()} PTS.`,
    );
  }

  input.tasks.forEach((task, i) => {
    const label = task.title?.trim() || `Task ${i + 1}`;
    if (!Number.isInteger(task.points) || task.points < 1) {
      errors.push(`${label}: Campaign PTS must be a whole number of 1 or more.`);
    } else if (task.points > PTS_LIMITS.maxTaskPts) {
      errors.push(`${label}: PTS per completion exceeds the platform limit of ${PTS_LIMITS.maxTaskPts}.`);
    }
    if (task.completionLimitPerWallet > PTS_LIMITS.maxCompletionLimitPerWallet) {
      errors.push(
        `${label}: completions per wallet exceeds the platform limit of ${PTS_LIMITS.maxCompletionLimitPerWallet}.`,
      );
    }
  });

  const perWalletMax = maxPtsPerWallet(input.tasks);
  if (Number.isInteger(budget) && perWalletMax > budget) {
    errors.push(
      `A single wallet could earn ${perWalletMax.toLocaleString()} PTS, which exceeds the declared budget of ${budget.toLocaleString()} PTS.`,
    );
  }
  return errors;
}

/** Worst-case issuance for one wallet across all tasks. */
export function maxPtsPerWallet(tasks: RevisionTask[]): number {
  return tasks.reduce(
    (sum, t) =>
      sum + Math.max(0, Number(t.points) || 0) * Math.max(1, Number(t.completionLimitPerWallet) || 1),
    0,
  );
}

/** Full submission gate: rules + PTS bounds. Empty array === submittable. */
export function validateSubmission(snapshot: CampaignRevisionSnapshot): string[] {
  const errors = [
    ...validateRevisionRules(snapshot.tasks),
    ...validatePtsBudget({
      rewardType: snapshot.rewardType,
      ptsBudget: snapshot.ptsBudget,
      tasks: snapshot.tasks,
    }),
  ];
  if (!snapshot.tasks.length) errors.push('Add at least one verified task before submitting.');
  if (!(snapshot.endsAt > snapshot.startsAt)) errors.push('End date must be after the start date.');
  return errors;
}

/* ------------------------------- fingerprint ------------------------------ */

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = canonical((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

/** Stable content fingerprint used for idempotent publishing. */
export function snapshotFingerprint(snapshot: CampaignRevisionSnapshot): string {
  const json = JSON.stringify(canonical(snapshot));
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < json.length; i++) {
    const c = json.charCodeAt(i);
    h1 = (h1 ^ c) * 16777619;
    h2 = (h2 + c * 31) ^ (h2 << 5);
    h1 >>>= 0;
    h2 >>>= 0;
  }
  return `fp_${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

/* --------------------------------- diffing -------------------------------- */

const FIELD_LABEL: Record<string, string> = {
  name: 'Name',
  slug: 'Handle',
  description: 'Description',
  startsAt: 'Start date',
  endsAt: 'End date',
  rewardType: 'Reward type',
  ptsBudget: 'Campaign PTS budget',
};

/** Human diff between two frozen revisions, for the reviewer surface. */
export function diffSnapshots(
  previous: CampaignRevisionSnapshot | null | undefined,
  next: CampaignRevisionSnapshot,
): string[] {
  if (!previous) return ['First submitted revision.'];
  const changes: string[] = [];
  for (const key of Object.keys(FIELD_LABEL)) {
    const a = (previous as any)[key];
    const b = (next as any)[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) changes.push(`${FIELD_LABEL[key]} changed.`);
  }
  const prevTasks = new Map(previous.tasks.map((t) => [t.taskId, t]));
  const nextTasks = new Map(next.tasks.map((t) => [t.taskId, t]));
  for (const [id, task] of nextTasks) {
    const before = prevTasks.get(id);
    if (!before) {
      changes.push(`Task added: ${task.title}.`);
      continue;
    }
    if (JSON.stringify(canonical(before.rules)) !== JSON.stringify(canonical(task.rules))) {
      changes.push(`Task "${task.title}": verification rules changed.`);
    }
    if (before.points !== task.points) {
      changes.push(`Task "${task.title}": PTS ${before.points} → ${task.points}.`);
    }
    if (before.completionLimitPerWallet !== task.completionLimitPerWallet) {
      changes.push(`Task "${task.title}": completions per wallet changed.`);
    }
    if (before.title !== task.title || before.description !== task.description) {
      changes.push(`Task "${task.title}": copy changed.`);
    }
  }
  for (const [id, task] of prevTasks) {
    if (!nextTasks.has(id)) changes.push(`Task removed: ${task.title}.`);
  }
  return changes.length ? changes : ['No content change from the previous revision.'];
}

/* ----------------------------- materialization ---------------------------- */

export interface MaterializationPlan {
  campaign: {
    campaign_id: string;
    organization_id: string;
    slug: string;
    name: string;
    description: string | null;
    starts_at: string;
    ends_at: string;
    reward_type: CampaignRewardType;
    pts_budget: number;
    status: 'published';
    review_state: 'published';
    published_revision: number;
  };
  tasks: {
    campaign_id: string;
    task_id: string;
    title: string;
    description: string | null;
    points: number;
    required_count: number;
    completion_limit_per_wallet: number;
    rules: unknown[];
    sort_order: number;
  }[];
  keepTaskIds: string[];
}

/**
 * Maps an approved snapshot onto the ONE canonical execution model. There is no
 * second campaign engine: verified_activities → campaign_completions →
 * campaign_points_ledger remains the only settlement path.
 */
export function materializationPlan(snapshot: CampaignRevisionSnapshot): MaterializationPlan {
  return {
    campaign: {
      campaign_id: snapshot.campaignId,
      organization_id: snapshot.organizationId,
      slug: snapshot.slug,
      name: snapshot.name,
      description: snapshot.description ?? null,
      starts_at: new Date(snapshot.startsAt).toISOString(),
      ends_at: new Date(snapshot.endsAt).toISOString(),
      reward_type: snapshot.rewardType,
      pts_budget: snapshot.ptsBudget,
      status: 'published',
      review_state: 'published',
      published_revision: snapshot.revision,
    },
    tasks: snapshot.tasks.map((t, i) => ({
      campaign_id: snapshot.campaignId,
      task_id: t.taskId,
      title: t.title,
      description: t.description ?? null,
      points: t.points,
      required_count: t.requiredCount,
      completion_limit_per_wallet: t.completionLimitPerWallet,
      rules: t.rules,
      sort_order: Number.isFinite(t.sortOrder) ? t.sortOrder : i,
    })),
    keepTaskIds: snapshot.tasks.map((t) => t.taskId),
  };
}
