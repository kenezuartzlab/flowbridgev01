import { describe, expect, it } from 'vitest';
import { FakeSupabase } from './fakeSupabase.testutil';
import {
  activeRevision,
  freezeSubmission,
  listReviewQueue,
  listRevisions,
  markRevision,
  materializeRevision,
} from './partnerRevisions.server';
import {
  PTS_LIMITS,
  diffSnapshots,
  maxPtsPerWallet,
  materializationPlan,
  snapshotFingerprint,
  validatePtsBudget,
  validateRevisionRules,
  validateSubmission,
  type RevisionTask,
} from './partnerRevision';

const RULE = { type: 'ACTIVITY_KIND', kind: 'SWAP_EXECUTED' } as const;

function task(overrides: Partial<RevisionTask> = {}): RevisionTask {
  return {
    taskId: 'swap-once',
    title: 'Swap once',
    description: null,
    points: 50,
    requiredCount: 1,
    completionLimitPerWallet: 1,
    rules: [RULE],
    sortOrder: 0,
    ...overrides,
  };
}

function freezeInput(overrides: Record<string, any> = {}) {
  return {
    campaignId: 'camp_a',
    organizationId: 'org_a',
    orgSlug: 'acme',
    orgName: 'Acme Labs',
    submittedBy: 'user_a',
    slug: 'acme-swap',
    name: 'Acme Swap Quest',
    description: 'Swap on FlowBridge.',
    startsAt: 1_800_000_000_000,
    endsAt: 1_800_500_000_000,
    rewardType: 'campaign_pts' as const,
    ptsBudget: 5_000,
    tasks: [task()],
    ...overrides,
  };
}

function seedDb() {
  return new FakeSupabase({
    campaigns: [
      {
        campaign_id: 'camp_a',
        organization_id: 'org_a',
        slug: 'acme-swap',
        name: 'Acme Swap Quest',
        status: 'draft',
        review_state: 'draft',
        reward_type: 'campaign_pts',
        pts_budget: 5_000,
        revision: 1,
      },
    ],
    campaign_tasks: [],
    campaign_completions: [],
    campaign_submission_revisions: [],
  });
}

describe('V14.1 submission policy bounds', () => {
  it('rejects rules that are not canonical verified-activity rules', () => {
    expect(validateRevisionRules([task({ rules: [{ type: 'FOLLOW_TWITTER' }] })])).toHaveLength(1);
    expect(validateRevisionRules([task()])).toEqual([]);
    expect(validateRevisionRules([task({ rules: [] })])).toHaveLength(1);
  });

  it('requires a bounded, positive Campaign PTS budget', () => {
    // Zero budget is rejected outright, and also cannot cover a single wallet.
    expect(
      validatePtsBudget({ rewardType: 'campaign_pts', ptsBudget: 0, tasks: [task()] }).join(' '),
    ).toMatch(/budget of 1 or more/i);
    expect(
      validatePtsBudget({
        rewardType: 'campaign_pts',
        ptsBudget: PTS_LIMITS.maxCampaignBudget + 1,
        tasks: [task()],
      }),
    ).toHaveLength(1);
    expect(validatePtsBudget({ rewardType: 'campaign_pts', ptsBudget: 500, tasks: [task()] })).toEqual([]);
  });

  it('caps per-task PTS and per-wallet issuance against the declared budget', () => {
    const errors = validatePtsBudget({
      rewardType: 'campaign_pts',
      ptsBudget: 100,
      tasks: [task({ points: PTS_LIMITS.maxTaskPts + 1, completionLimitPerWallet: 5 })],
    });
    expect(errors.join(' ')).toMatch(/platform limit/i);
    expect(errors.join(' ')).toMatch(/exceeds the declared budget/i);
    expect(maxPtsPerWallet([task({ points: 10, completionLimitPerWallet: 3 })])).toBe(30);
  });

  it('non-PTS reward requests may not carry PTS or budget', () => {
    expect(
      validatePtsBudget({ rewardType: 'flow_token', ptsBudget: 0, tasks: [task({ points: 0 })] }),
    ).toEqual([]);
    expect(
      validatePtsBudget({ rewardType: 'flow_token', ptsBudget: 10, tasks: [task()] }),
    ).toHaveLength(1);
  });
});

describe('V14.1 snapshot fingerprint and diff', () => {
  it('fingerprints content, not key order', async () => {
    const db = seedDb();
    const rev = await freezeSubmission(db, freezeInput());
    const reordered = { ...rev.snapshot, tasks: [...rev.snapshot.tasks] };
    expect(snapshotFingerprint(reordered)).toBe(rev.fingerprint);
    const changed = { ...rev.snapshot, ptsBudget: 6_000 };
    expect(snapshotFingerprint(changed)).not.toBe(rev.fingerprint);
  });

  it('reports reviewer-facing changes between revisions', () => {
    const a = { ...freezeInput(), revision: 1 } as any;
    const b = { ...freezeInput({ ptsBudget: 9_000, tasks: [task({ points: 75 })] }), revision: 2 } as any;
    const changes = diffSnapshots(a, b);
    expect(changes.join(' ')).toMatch(/Campaign PTS budget changed/);
    expect(changes.join(' ')).toMatch(/PTS 50 → 75/);
    expect(diffSnapshots(null, b)).toEqual(['First submitted revision.']);
  });
});

describe('V14.1 lifecycle: submit → review → publish', () => {
  it('freezes an immutable snapshot and supersedes the previous submission', async () => {
    const db = seedDb();
    const first = await freezeSubmission(db, freezeInput());
    expect(first.revision).toBe(1);
    expect(first.status).toBe('submitted');

    const second = await freezeSubmission(db, freezeInput({ ptsBudget: 7_000 }));
    expect(second.revision).toBe(2);

    const all = await listRevisions(db, 'camp_a');
    expect(all.find((r) => r.revision === 1)!.status).toBe('superseded');
    // The superseded snapshot content is untouched by the newer submission.
    expect(all.find((r) => r.revision === 1)!.snapshot.ptsBudget).toBe(5_000);
    expect((await activeRevision(db, 'camp_a'))!.revision).toBe(2);
  });

  it('refuses to freeze a draft that violates policy', async () => {
    const db = seedDb();
    await expect(
      freezeSubmission(db, freezeInput({ tasks: [task({ rules: [{ type: 'NOPE' }] })] })),
    ).rejects.toThrow(/rejected/i);
    await expect(freezeSubmission(db, freezeInput({ ptsBudget: 0 }))).rejects.toThrow(/budget/i);
    expect(await listRevisions(db, 'camp_a')).toHaveLength(0);
  });

  it('rate-limits submissions per organization', async () => {
    const db = seedDb();
    for (let i = 0; i < PTS_LIMITS.maxSubmissionsPerHour; i++) {
      await freezeSubmission(db, freezeInput());
    }
    await expect(freezeSubmission(db, freezeInput())).rejects.toThrow(/Too many submissions/i);
  });

  it('publishes only an approved snapshot, and materializes exactly that snapshot', async () => {
    const db = seedDb();
    const rev = await freezeSubmission(db, freezeInput());

    await expect(materializeRevision(db, rev)).rejects.toThrow(/approved/i);

    await markRevision(db, rev.revisionId, 'approved', { reviewerId: 'admin_1' });
    const approved = (await listRevisions(db, 'camp_a'))[0];
    const result = await materializeRevision(db, approved);
    expect(result.published).toBe(true);

    const campaign = db.tables.campaigns[0];
    expect(campaign.status).toBe('published');
    expect(campaign.review_state).toBe('published');
    expect(campaign.published_revision).toBe(1);
    expect(campaign.published_revision_id).toBe(approved.revisionId);
    expect(db.tables.campaign_tasks).toHaveLength(1);
    expect(db.tables.campaign_tasks[0]).toMatchObject({
      campaign_id: 'camp_a',
      task_id: 'swap-once',
      points: 50,
    });
    expect((await listRevisions(db, 'camp_a'))[0].status).toBe('published');
  });

  it('republishing the same revision is idempotent', async () => {
    const db = seedDb();
    const rev = await freezeSubmission(db, freezeInput());
    await markRevision(db, rev.revisionId, 'approved');
    const approved = (await listRevisions(db, 'camp_a'))[0];
    await materializeRevision(db, approved);
    const again = await materializeRevision(db, { ...approved, status: 'approved' });
    expect(again.published).toBe(false);
    expect(db.tables.campaign_tasks).toHaveLength(1);
  });

  it('never deletes a task that already has recorded completions', async () => {
    const db = seedDb();
    const rev = await freezeSubmission(db, freezeInput({ tasks: [task(), task({ taskId: 'swap-twice', sortOrder: 1 })] }));
    await markRevision(db, rev.revisionId, 'approved');
    await materializeRevision(db, (await listRevisions(db, 'camp_a'))[0]);
    db.tables.campaign_completions.push({ campaign_id: 'camp_a', task_id: 'swap-twice' });

    const next = await freezeSubmission(db, freezeInput({ tasks: [task()] }));
    await markRevision(db, next.revisionId, 'approved');
    await materializeRevision(db, (await listRevisions(db, 'camp_a'))[0]);

    const ids = db.tables.campaign_tasks.map((t: any) => t.task_id);
    expect(ids).toContain('swap-once');
    // Evidence-bearing task is retained even though the new snapshot dropped it.
    expect(ids).toContain('swap-twice');
  });

  it('surfaces outstanding submissions in the internal review queue', async () => {
    const db = seedDb();
    await freezeSubmission(db, freezeInput());
    const queue = await listReviewQueue(db);
    expect(queue).toHaveLength(1);
    expect(queue[0].snapshot.orgName).toBe('Acme Labs');
  });

  it('maps a snapshot onto the canonical engine without inventing fields', () => {
    const plan = materializationPlan({
      ...freezeInput(),
      revision: 3,
    } as any);
    expect(plan.campaign.status).toBe('published');
    expect(plan.campaign.published_revision).toBe(3);
    expect(plan.tasks[0].required_count).toBe(1);
    expect(plan.keepTaskIds).toEqual(['swap-once']);
    expect(validateSubmission({ ...freezeInput(), revision: 3 } as any)).toEqual([]);
  });
});
