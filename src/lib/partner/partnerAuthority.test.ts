/**
 * FlowBridge V14.1A — Partner Studio closure proof.
 *
 * Exercises the REAL server modules (partnerGate, partnerStudio,
 * partnerGovernance, partnerRevisions and the public Explore read API) against
 * an in-memory Data API so the following are proven end to end without any
 * blockchain transaction:
 *
 *  1. partner organization isolation / IDOR resistance,
 *  2. internal role separation (Super Admin vs Internal Operator),
 *  3. immutable revision lifecycle (R1 -> changes -> R2 -> approve R2 only),
 *  4. canonical publish materialization + idempotency,
 *  5. Campaign PTS-only reward authority and finite issuance bounds,
 *  6. pause disabling new settlement while history is retained.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeSupabase } from './fakeSupabase.testutil';

/* ------------------------------ shared fixture ---------------------------- */

const CAMPAIGN_A = `0x${'a1'.repeat(32)}`;
const CAMPAIGN_B = `0x${'b2'.repeat(32)}`;

let fake: FakeSupabase;
let authUser: { id: string; email: string; emailVerified: boolean } | null = null;

vi.mock('@/integrations/supabase/client.server', () => ({
  get supabaseAdmin() {
    return fake as any;
  },
}));

vi.mock('@/lib/api-auth.server', () => ({
  getAuthUser: async () => authUser,
  jsonResponse: (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
}));

const { requirePartner } = await import('./partnerGate.server');
const {
  getPartnerCampaign,
  listPartnerCampaigns,
  partnerTransition,
  savePartnerCampaign,
} = await import('./partnerStudio.server');
const { governanceCampaignAction, governanceOrgAction, listGovernanceCampaigns } = await import(
  './partnerGovernance.server'
);
const { listRevisions } = await import('./partnerRevisions.server');
const { listPublishedCampaigns } = await import('@/lib/campaign/campaignApi.server');

const RULE = { type: 'ACTIVITY_KIND', kind: 'SWAP_EXECUTED' } as const;

const partnerA = {
  userId: 'user_a',
  email: 'a@acme.test',
  orgId: 'org_a',
  role: 'partner_admin' as const,
  org: { orgId: 'org_a', slug: 'acme', name: 'Acme Labs', status: 'verified' as const, isSystem: false },
};
const partnerB = {
  ...partnerA,
  userId: 'user_b',
  email: 'b@borg.test',
  orgId: 'org_b',
  org: { orgId: 'org_b', slug: 'borg', name: 'Borg Systems', status: 'verified' as const, isSystem: false },
};

const superAdmin = {
  userId: 'admin_1',
  email: 'root@flowbridge.space',
  wallet: '0x' + '1'.repeat(40),
  role: 'super_admin' as const,
};
const operator = { ...superAdmin, userId: 'admin_2', email: 'ops@flowbridge.space', role: 'internal_operator' as const };

function draft(overrides: Record<string, any> = {}) {
  return {
    slug: 'acme-swap',
    name: 'Acme Swap Quest',
    description: 'Swap on FlowBridge.',
    startsAt: 1_800_000_000_000,
    endsAt: 1_800_500_000_000,
    rewardType: 'campaign_pts',
    ptsBudget: 5_000,
    tasks: [
      {
        taskId: 'swap-once',
        title: 'Swap once',
        description: null,
        points: 50,
        requiredCount: 1,
        completionLimitPerWallet: 1,
        rules: [RULE],
        sortOrder: 0,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  authUser = null;
  fake = new FakeSupabase({
    partner_organizations: [
      { org_id: 'org_a', slug: 'acme', name: 'Acme Labs', status: 'verified', is_system: false, created_at: '2026-01-01T00:00:00Z' },
      { org_id: 'org_b', slug: 'borg', name: 'Borg Systems', status: 'verified', is_system: false, created_at: '2026-01-02T00:00:00Z' },
    ],
    partner_org_members: [
      { org_id: 'org_a', user_id: 'user_a', role: 'partner_admin' },
      { org_id: 'org_b', user_id: 'user_b', role: 'partner_editor' },
    ],
    campaigns: [
      {
        campaign_id: CAMPAIGN_B,
        organization_id: 'org_b',
        slug: 'borg-secret',
        name: 'Borg Private Quest',
        description: null,
        status: 'draft',
        review_state: 'draft',
        reward_type: 'campaign_pts',
        pts_budget: 1_000,
        starts_at: '2026-02-01T00:00:00Z',
        ends_at: '2026-03-01T00:00:00Z',
        revision: 1,
        updated_at: '2026-02-01T00:00:00Z',
      },
    ],
    campaign_tasks: [],
    campaign_completions: [],
    campaign_submission_revisions: [],
    campaign_review_events: [],
    admin_audit_events: [],
  });
});

/* ------------------------- 1. organization isolation ---------------------- */

describe('V14.1A · partner organization isolation', () => {
  it('a partner cannot read another organization campaign by guessed id', async () => {
    await expect(getPartnerCampaign(partnerA as any, CAMPAIGN_B)).rejects.toThrow(/not found/i);
  });

  it('a partner cannot mutate another organization campaign', async () => {
    await expect(
      savePartnerCampaign(partnerA as any, draft(), { campaignId: CAMPAIGN_B }),
    ).rejects.toThrow(/not found/i);
    await expect(partnerTransition(partnerA as any, CAMPAIGN_B, 'submit')).rejects.toThrow(
      /not found/i,
    );
  });

  it('lists only own-org campaigns', async () => {
    await savePartnerCampaign(partnerA as any, draft());
    const mine = await listPartnerCampaigns(partnerA as any);
    expect(mine).toHaveLength(1);
    expect(mine[0].organizationId).toBe('org_a');
    const theirs = await listPartnerCampaigns(partnerB as any);
    expect(theirs.map((c) => c.campaignId)).toContain(CAMPAIGN_B);
  });

  it('client-supplied organizationId / status / review_state can never override membership', async () => {
    const saved = await savePartnerCampaign(partnerA as any, {
      ...draft(),
      organizationId: 'org_b',
      organization_id: 'org_b',
      status: 'published',
      review_state: 'published',
      published: true,
    });
    expect(saved.organizationId).toBe('org_a');
    expect(saved.published).toBe(false);
    expect(saved.reviewState).toBe('draft');
    expect(await listPublishedCampaigns()).toHaveLength(0);
  });

  it('x-org-id selects between memberships but never grants one', async () => {
    authUser = { id: 'user_a', email: 'a@acme.test', emailVerified: true };
    const own = await requirePartner(new Request('http://x', { headers: { 'x-org-id': 'org_a' } }));
    expect(own.ok && own.partner.orgId).toBe('org_a');
    expect(own.ok && own.partner.role).toBe('partner_admin');

    const foreign = await requirePartner(
      new Request('http://x', { headers: { 'x-org-id': 'org_b' } }),
    );
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.response.status).toBe(404);

    const guessed = await requirePartner(
      new Request('http://x', { headers: { 'x-org-id': 'org_zzz' } }),
    );
    if (!guessed.ok) expect(guessed.response.status).toBe(404);
  });

  it('an account with no membership is refused, and unverified email is refused', async () => {
    authUser = { id: 'user_none', email: 'nobody@test', emailVerified: true };
    const none = await requirePartner(new Request('http://x'));
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.response.status).toBe(403);

    authUser = { id: 'user_a', email: 'a@acme.test', emailVerified: false };
    const unverified = await requirePartner(new Request('http://x'));
    if (!unverified.ok) expect(unverified.response.status).toBe(403);

    authUser = null;
    const anon = await requirePartner(new Request('http://x'));
    if (!anon.ok) expect(anon.response.status).toBe(401);
  });

  it('the role is read from the membership row, not from the request', async () => {
    authUser = { id: 'user_b', email: 'b@borg.test', emailVerified: true };
    const gate = await requirePartner(
      new Request('http://x', { headers: { 'x-role': 'partner_admin' } }),
    );
    expect(gate.ok && gate.partner.role).toBe('partner_editor');
  });

  it('a suspended organization cannot operate', async () => {
    fake.tables.partner_organizations[0].status = 'suspended';
    authUser = { id: 'user_a', email: 'a@acme.test', emailVerified: true };
    const gate = await requirePartner(new Request('http://x'));
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(403);
  });
});

/* --------------------------- 2. internal separation ----------------------- */

describe('V14.1A · internal role separation', () => {
  it('an Internal Operator may moderate campaigns but not verify organizations', async () => {
    const saved = await savePartnerCampaign(partnerA as any, draft());
    await partnerTransition(partnerA as any, saved.campaignId, 'submit');

    const approved = await governanceCampaignAction(operator as any, saved.campaignId, 'approve');
    expect(approved.reviewState).toBe('approved');

    await expect(governanceOrgAction(operator as any, 'org_a', 'verify_org')).rejects.toThrow(
      /Super Admin/i,
    );
    await expect(governanceOrgAction(operator as any, 'org_a', 'suspend_org')).rejects.toThrow(
      /Super Admin/i,
    );
  });

  it('a Super Admin retains organization verification and suspension authority', async () => {
    const verified = await governanceOrgAction(superAdmin as any, 'org_a', 'verify_org', 'KYB ok');
    expect(verified.status).toBe('verified');
    const suspended = await governanceOrgAction(superAdmin as any, 'org_a', 'suspend_org', 'risk');
    expect(suspended.status).toBe('suspended');
    expect(fake.tables.admin_audit_events.map((e) => e.action)).toEqual(
      expect.arrayContaining(['verify_org', 'suspend_org']),
    );
  });

  it('a partner role can never cause an internal transition', async () => {
    const saved = await savePartnerCampaign(partnerA as any, draft());
    await partnerTransition(partnerA as any, saved.campaignId, 'submit');
    await expect(
      partnerTransition(partnerA as any, saved.campaignId, 'publish' as any),
    ).rejects.toThrow(/Cannot publish/i);
  });

  it('a partner_viewer cannot edit or submit', async () => {
    const viewer = { ...partnerA, role: 'partner_viewer' as const };
    await expect(savePartnerCampaign(viewer as any, draft())).rejects.toThrow(/read-only/i);
  });

  it('an editor may save but only a partner admin may submit', async () => {
    const editor = { ...partnerA, role: 'partner_editor' as const };
    const saved = await savePartnerCampaign(editor as any, draft());
    await expect(partnerTransition(editor as any, saved.campaignId, 'submit')).rejects.toThrow(
      /Partner Admin/i,
    );
  });
});

/* ------------------------- 3. immutable revisions ------------------------- */

describe('V14.1A · immutable revision lifecycle', () => {
  it('R1 freezes, is locked in review, and survives R2 intact', async () => {
    const saved = await savePartnerCampaign(partnerA as any, draft());
    await partnerTransition(partnerA as any, saved.campaignId, 'submit');

    const [r1] = await listRevisions(fake as any, saved.campaignId);
    expect(r1.revision).toBe(1);
    expect(r1.status).toBe('submitted');
    expect(r1.fingerprint).toMatch(/^fp_/);

    // Mutation while IN_REVIEW must fail.
    await expect(
      savePartnerCampaign(partnerA as any, draft({ name: 'Sneaky edit' }), {
        campaignId: saved.campaignId,
      }),
    ).rejects.toThrow(/locked/i);

    await governanceCampaignAction(operator as any, saved.campaignId, 'request_changes', 'tighten');

    await savePartnerCampaign(
      partnerA as any,
      draft({ name: 'Acme Swap Quest v2', tasks: [{ ...draft().tasks[0], points: 75 }] }),
      { campaignId: saved.campaignId },
    );
    await partnerTransition(partnerA as any, saved.campaignId, 'submit');

    const revisions = await listRevisions(fake as any, saved.campaignId);
    const r2 = revisions.find((r) => r.revision === 2)!;
    const r1After = revisions.find((r) => r.revision === 1)!;

    expect(r2.fingerprint).not.toBe(r1.fingerprint);
    expect(r1After.fingerprint).toBe(r1.fingerprint);
    expect(r1After.snapshot.name).toBe('Acme Swap Quest');
    expect(r1After.snapshot.tasks[0].points).toBe(50);
    expect(r1After.status).toBe('changes_requested');

    // Approving acts only on the outstanding revision (R2).
    await governanceCampaignAction(operator as any, saved.campaignId, 'approve', 'looks good');
    const after = await listRevisions(fake as any, saved.campaignId);
    expect(after.find((r) => r.revision === 2)!.status).toBe('approved');
    expect(after.find((r) => r.revision === 1)!.status).toBe('changes_requested');

    const actions = fake.tables.campaign_review_events.map((e) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'draft_created',
        'submit',
        'request_changes',
        'draft_updated',
        'approve',
      ]),
    );
    for (const event of fake.tables.campaign_review_events) {
      expect(event.actor_role).toBeTruthy();
      expect(event.campaign_id).toBe(saved.campaignId);
    }
  });

  it('withdraw releases the outstanding submission without destroying it', async () => {
    const saved = await savePartnerCampaign(partnerA as any, draft());
    await partnerTransition(partnerA as any, saved.campaignId, 'submit');
    await partnerTransition(partnerA as any, saved.campaignId, 'withdraw');
    const [r1] = await listRevisions(fake as any, saved.campaignId);
    expect(r1.status).toBe('withdrawn');
    expect(r1.snapshot.name).toBe('Acme Swap Quest');
  });
});

/* ----------------------- 4. canonical publish + idempotency --------------- */

describe('V14.1A · canonical publish materialization', () => {
  async function publishOnce() {
    const saved = await savePartnerCampaign(partnerA as any, draft());
    await partnerTransition(partnerA as any, saved.campaignId, 'submit');
    await governanceCampaignAction(operator as any, saved.campaignId, 'request_changes', 'v2 please');
    await savePartnerCampaign(
      partnerA as any,
      draft({ name: 'Acme Swap Quest v2', tasks: [{ ...draft().tasks[0], points: 75 }] }),
      { campaignId: saved.campaignId },
    );
    await partnerTransition(partnerA as any, saved.campaignId, 'submit');
    await governanceCampaignAction(operator as any, saved.campaignId, 'approve');
    const published = await governanceCampaignAction(operator as any, saved.campaignId, 'publish');
    return { campaignId: saved.campaignId, published };
  }

  it('publishes exactly the approved revision into one canonical campaign', async () => {
    const { campaignId, published } = await publishOnce();
    expect(published.published).toBe(true);
    expect(published.publishedRevision).toBe(2);

    const canonical = fake.tables.campaigns.filter((c) => c.campaign_id === campaignId);
    expect(canonical).toHaveLength(1);
    expect(canonical[0].status).toBe('published');
    expect(canonical[0].name).toBe('Acme Swap Quest v2');
    expect(canonical[0].organization_id).toBe('org_a');
    // Provenance: org -> submission -> approved revision -> canonical campaign.
    const revision = fake.tables.campaign_submission_revisions.find(
      (r) => r.revision_id === canonical[0].published_revision_id,
    );
    expect(revision.campaign_id).toBe(campaignId);
    expect(revision.organization_id).toBe('org_a');
    expect(revision.revision).toBe(2);

    const tasks = fake.tables.campaign_tasks.filter((t) => t.campaign_id === campaignId);
    expect(tasks).toHaveLength(1);
    expect(Number(tasks[0].points)).toBe(75);
  });

  it('Explore reads the canonical live campaign, not a Studio duplicate', async () => {
    const { campaignId } = await publishOnce();
    const live = await listPublishedCampaigns();
    expect(live).toHaveLength(1);
    expect(live[0].campaign.campaignId).toBe(campaignId);
    expect(live[0].campaign.name).toBe('Acme Swap Quest v2');
    expect(live[0].tasks).toHaveLength(1);
    expect(live[0].tasks[0].points).toBe(75);
  });

  it('republishing is idempotent — no duplicate campaign or task set', async () => {
    const { campaignId } = await publishOnce();
    await governanceCampaignAction(operator as any, campaignId, 'pause');
    await governanceCampaignAction(operator as any, campaignId, 'publish');
    await governanceCampaignAction(operator as any, campaignId, 'pause');
    await governanceCampaignAction(operator as any, campaignId, 'publish');

    expect(fake.tables.campaigns.filter((c) => c.campaign_id === campaignId)).toHaveLength(1);
    expect(fake.tables.campaign_tasks.filter((t) => t.campaign_id === campaignId)).toHaveLength(1);
    expect(
      fake.tables.campaign_submission_revisions.filter((r) => r.campaign_id === campaignId),
    ).toHaveLength(2);
    expect(await listPublishedCampaigns()).toHaveLength(1);
  });

  it('pause disables public settlement reads while history is retained', async () => {
    const { campaignId } = await publishOnce();
    fake.tables.campaign_completions.push({
      completion_id: `0x${'c3'.repeat(32)}`,
      campaign_id: campaignId,
      task_id: 'swap-once',
      user_wallet: `0x${'d4'.repeat(20)}`,
      points: 75,
    });

    const paused = await governanceCampaignAction(operator as any, campaignId, 'pause', 'cooldown');
    expect(paused.reviewState).toBe('paused');
    expect(paused.published).toBe(false);
    expect(await listPublishedCampaigns()).toHaveLength(0);
    // History survives.
    expect(fake.tables.campaign_completions.filter((c) => c.campaign_id === campaignId)).toHaveLength(1);
    expect(paused.completionCount).toBe(1);
  });

  it('a suspended organization pauses its live campaigns and keeps evidence', async () => {
    const { campaignId } = await publishOnce();
    await governanceOrgAction(superAdmin as any, 'org_a', 'suspend_org', 'risk review');
    const row = fake.tables.campaigns.find((c) => c.campaign_id === campaignId);
    expect(row.review_state).toBe('paused');
    expect(row.status).toBe('draft');
    expect(
      fake.tables.campaign_submission_revisions.filter((r) => r.campaign_id === campaignId).length,
    ).toBeGreaterThan(0);
  });

  it('publishing before approval fails closed', async () => {
    const saved = await savePartnerCampaign(partnerA as any, draft());
    await partnerTransition(partnerA as any, saved.campaignId, 'submit');
    await expect(
      governanceCampaignAction(operator as any, saved.campaignId, 'publish'),
    ).rejects.toThrow(/cannot publish/i);
    expect(await listPublishedCampaigns()).toHaveLength(0);
  });
});

/* ---------------------- 5. Campaign PTS-only authority -------------------- */

describe('V14.1A · Campaign PTS-only reward authority', () => {
  it('a FLOW token or FLOW Points reward request cannot carry PTS or publish', async () => {
    await expect(
      savePartnerCampaign(partnerA as any, draft({ rewardType: 'flow_token' })),
    ).rejects.toThrow(/Campaign PTS/i);

    const proposal = await savePartnerCampaign(
      partnerA as any,
      draft({
        rewardType: 'flow_token',
        ptsBudget: 0,
        tasks: [{ ...draft().tasks[0], points: 0 }],
      }),
    );
    expect(proposal.rewardType).toBe('flow_token');
    expect(proposal.ptsBudget).toBe(0);

    await expect(partnerTransition(partnerA as any, proposal.campaignId, 'submit')).rejects.toThrow(
      /Campaign PTS/i,
    );
    fake.tables.campaigns.find((c) => c.campaign_id === proposal.campaignId).review_state =
      'submitted';
    await expect(
      governanceCampaignAction(operator as any, proposal.campaignId, 'approve'),
    ).rejects.toThrow();
    await expect(
      governanceCampaignAction(superAdmin as any, proposal.campaignId, 'publish'),
    ).rejects.toThrow();
    expect(await listPublishedCampaigns()).toHaveLength(0);
  });

  it('unbounded or over-limit Campaign PTS issuance cannot be submitted', async () => {
    // No declared budget => fails closed at submit time.
    const unbounded = await savePartnerCampaign(partnerA as any, draft({ ptsBudget: 0 }));
    await expect(partnerTransition(partnerA as any, unbounded.campaignId, 'submit')).rejects.toThrow(
      /budget/i,
    );

    // Above the platform ceiling => refused at save time.
    await expect(
      savePartnerCampaign(partnerA as any, draft({ ptsBudget: 400_000 })),
    ).rejects.toThrow(/platform limit/i);
    await expect(
      savePartnerCampaign(
        partnerA as any,
        draft({ tasks: [{ ...draft().tasks[0], points: 900 }] }),
      ),
    ).rejects.toThrow(/platform limit/i);
  });

  it('worst-case per-wallet issuance must fit inside the declared budget', async () => {
    const tight = await savePartnerCampaign(
      partnerA as any,
      draft({
        ptsBudget: 100,
        tasks: [{ ...draft().tasks[0], points: 50, completionLimitPerWallet: 20 }],
      }),
    );
    await expect(partnerTransition(partnerA as any, tight.campaignId, 'submit')).rejects.toThrow(
      /exceeds the declared budget/i,
    );
  });

  it('a non-parsing verification rule can never become executable', async () => {
    const bogus = await savePartnerCampaign(
      partnerA as any,
      draft({ tasks: [{ ...draft().tasks[0], rules: [{ type: 'GIVE_ME_FLOW' }] }] }),
    );
    await expect(partnerTransition(partnerA as any, bogus.campaignId, 'submit')).rejects.toThrow();
    expect(await listPublishedCampaigns()).toHaveLength(0);
  });
});

/* --------------------------- 6. no-chain canary --------------------------- */

describe('V14.1A · end-to-end no-chain canary', () => {
  it('draft → submit → changes → resubmit → approve → publish, with cross-org writes refused', async () => {
    const saved = await savePartnerCampaign(partnerA as any, draft());
    await partnerTransition(partnerA as any, saved.campaignId, 'submit');
    await governanceCampaignAction(operator as any, saved.campaignId, 'request_changes', 'reword');
    await savePartnerCampaign(partnerA as any, draft({ name: 'Acme Swap Quest v2' }), {
      campaignId: saved.campaignId,
    });
    await partnerTransition(partnerA as any, saved.campaignId, 'submit');
    await governanceCampaignAction(operator as any, saved.campaignId, 'approve');
    await governanceCampaignAction(operator as any, saved.campaignId, 'publish');

    const live = await listPublishedCampaigns();
    expect(live).toHaveLength(1);
    expect(live[0].campaign.name).toBe('Acme Swap Quest v2');
    expect(live[0].tasks[0].points).toBe(50);

    // Cross-org unauthorized write.
    await expect(
      savePartnerCampaign(partnerB as any, draft({ slug: 'hijack' }), {
        campaignId: saved.campaignId,
      }),
    ).rejects.toThrow(/not found/i);

    // Partner-direct publish.
    await expect(
      partnerTransition(partnerA as any, saved.campaignId, 'publish' as any),
    ).rejects.toThrow();

    const governance = await listGovernanceCampaigns();
    const row = governance.find((c) => c.campaignId === saved.campaignId)!;
    expect(row.orgName).toBe('Acme Labs');
    expect(row.published).toBe(true);
    expect(row.rewardType).toBe('campaign_pts');
    expect(row.maxPtsPerWallet).toBeLessThanOrEqual(row.ptsBudget);
  });
});
