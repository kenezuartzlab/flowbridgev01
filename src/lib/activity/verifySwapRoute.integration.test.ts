/**
 * V8.4A — end-to-end regression at the REAL public route boundary.
 *
 * Exercises POST /api/public/activity/verify-swap through the actual route
 * handler -> trusted settlement handoff -> durable evidence reader -> campaign
 * engine -> settlement RPC, using a deterministic already-durable
 * SWAP_EXECUTED activity (created: false).
 *
 * This is the chain that failed live with HTTP 500 "kind is invalid" while the
 * isolated V8.4 parser test passed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const WALLET = '0x1111111111111111111111111111111111111111';
const CAMPAIGN_ID = '0x' + '3a'.repeat(32);
const ACTION_TYPE = '0x' + 'a3'.repeat(32);
const TOKEN = '0x2222222222222222222222222222222222222222';
const ACTIVITY_ID = '0x' + 'ab'.repeat(32);

const activityRow = (kind: string) => ({
  activity_id: ACTIVITY_ID,
  user_wallet: WALLET,
  kind,
  status: 'CONFIRMED',
  source_chain_id: 968,
  destination_chain_id: 968,
  action_type: ACTION_TYPE,
  token: TOKEN,
  amount_raw: '1000000000000000000',
  campaign_id: null,
  occurred_at: new Date(1_700_000_000_000).toISOString(),
});

const campaignRow = {
  campaign_id: CAMPAIGN_ID,
  slug: 'v84a-swap-canary',
  name: 'V8.4A Swap Canary',
  description: null,
  status: 'published',
  starts_at: new Date(1_600_000_000_000).toISOString(),
  ends_at: new Date(1_800_000_000_000).toISOString(),
};

const taskRow = (kind: string) => ({
  campaign_id: CAMPAIGN_ID,
  task_id: 'verified-swap',
  title: 'Verified swap',
  description: null,
  points: 250,
  required_count: 1,
  completion_limit_per_wallet: 1,
  rules: [
    { type: 'ACTIVITY_KIND', kind },
    { type: 'SOURCE_CHAIN', chainId: 968 },
    { type: 'ACTION_TYPE', actionType: ACTION_TYPE },
  ],
  sort_order: 100,
});

/** Durable state shared by the fake service-role client across replays. */
const settled: any[] = [];
let currentKind = 'SWAP_EXECUTED';

const fakeAdmin = {
  from(table: string) {
    const rows =
      table === 'campaigns'
        ? [campaignRow]
        : table === 'campaign_tasks'
          ? [taskRow(currentKind)]
          : table === 'verified_activities'
            ? [activityRow(currentKind)]
            : table === 'campaign_completions'
              ? settled.map((c) => ({
                  completion_id: c.p_completion_id,
                  task_id: c.p_task_id,
                  points: 250,
                  campaign_completion_activities: (c.p_activity_ids ?? []).map(
                    (activity_id: string) => ({ activity_id }),
                  ),
                }))
              : [];
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: any) => Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    return builder;
  },
  async rpc(name: string, args: any) {
    if (name !== 'admin_settle_campaign_completion') {
      throw new Error(`unexpected rpc: ${name}`);
    }
    const exists = settled.some((c) => c.p_completion_id === args.p_completion_id);
    if (!exists) settled.push(args);
    return {
      data: [
        {
          inserted: !exists,
          completion_id: args.p_completion_id,
          points_awarded: exists ? 0 : 250,
        },
      ],
      error: null,
    };
  },
};

vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: fakeAdmin }));

vi.mock('@/lib/activity/swapVerification.server', () => ({
  FinalityConfigError: class FinalityConfigError extends Error {},
  handleSwapActivityVerification: async () => ({
    status: 'CONFIRMED',
    created: false,
    activity: {
      activityId: ACTIVITY_ID,
      user: WALLET,
      kind: currentKind,
      status: 'CONFIRMED',
    },
  }),
}));

/**
 * V9.4A — every module the route handler pulls in lazily is resolved here at
 * COLLECTION time (statically, after the hoisted vi.mock factories), so no test
 * body ever pays for a Vite transform of the route / parser / settlement chain.
 * That transform cost was the entire source of the intermittent 5s timeout.
 */
const routeModulePromise = import('@/routes/api/public/activity.verify-swap');
const warmup = Promise.all([
  routeModulePromise,
  import('@/lib/activity/activityVerifyRequest'),
  import('@/lib/activity/swapVerification.server'),
  import('@/lib/campaign/activityCampaignSettlement.server'),
]);

const post = async () => {
  const { Route } = await routeModulePromise;
  const handler = (Route as any).options.server.handlers.POST;
  const request = new Request('http://localhost/api/public/activity/verify-swap', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // Shape-valid signed handoff (the trusted verifier itself is stubbed at its
    // server boundary; no real signature or on-chain evidence is reconstructed).
    body: JSON.stringify({
      intent: {
        intentId: '0x' + '11'.repeat(32),
        user: WALLET,
        actionType: ACTION_TYPE,
        sourceChainId: '968',
        destinationChainId: '968',
        token: TOKEN,
        amount: '1000000000000000000',
        recipient: WALLET,
        // The preserved live intent carries a zero campaignId; settlement
        // matches published campaigns from trusted rules, not from this field.
        campaignId: '0x' + '00'.repeat(32),
        nonce: '1',
        deadline: '9999999999',
      },
      signature: '0x' + '22'.repeat(65),
      intentHash: '0x' + '33'.repeat(32),
      sourceTxHash: '0x' + '44'.repeat(32),
    }),
  });
  const response = await handler({ request });
  return { response, body: await response.json() };
};

describe('POST /api/public/activity/verify-swap — deployed settlement chain', () => {
  // Module resolution is awaited in a hook (60s collect / 10s hook budget),
  // never inside a 5s test body.
  beforeAll(async () => {
    await warmup;
  });

  beforeEach(() => {
    settled.length = 0;
    currentKind = 'SWAP_EXECUTED';
  });

  afterEach(() => {
    // No timers, env stubs or spies are created here; still reset every piece of
    // shared mutable state so ordering between tests can never matter.
    settled.length = 0;
    currentKind = 'SWAP_EXECUTED';
    vi.clearAllMocks();
  });


  it('does not 500 for a durable SWAP_EXECUTED activity and settles once', async () => {
    const first = await post();
    expect(first.response.status).toBe(200);
    expect(first.body.status).toBe('CONFIRMED');
    expect(first.body.created).toBe(false);
    expect(first.body.campaignSettlement.pointsAwarded).toBe(250);
    expect(first.body.campaignSettlement.completions).toBe(1);
  });

  it('replays the same canonical evidence with zero additional PTS', async () => {
    await post();
    const replay = await post();
    expect(replay.response.status).toBe(200);
    expect(replay.body.campaignSettlement.pointsAwarded).toBe(0);
    expect(replay.body.campaignSettlement.completions).toBe(0);
    expect(settled).toHaveLength(1);
  });

  it('keeps BRIDGE_SUBMITTED and BRIDGE_COMPLETED settling through the same route', async () => {
    for (const kind of ['BRIDGE_SUBMITTED', 'BRIDGE_COMPLETED']) {
      settled.length = 0;
      currentKind = kind;
      const res = await post();
      expect(res.response.status).toBe(200);
      expect(res.body.campaignSettlement.pointsAwarded).toBe(250);
    }
  });
});
