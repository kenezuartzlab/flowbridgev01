import { describe, expect, it, vi } from 'vitest';
import type { Hex } from '../activity/activityIntent';
import {
  DurableEvidenceError,
  createBackendCampaignCompletionRepository,
  factsFromDurableRow,
  loadConfirmedActivitiesForWallet,
  parseDurableBigInt,
  settleDurableCampaignsForWallet,
} from './campaignSettlement.server';
import { settleCampaignsForVerificationOutcome } from './activityCampaignSettlement.server';
import { createInMemoryCampaignCompletionRepository } from './campaignCompletionRepository';
import type { CampaignDefinition } from './campaignApi.server';
import type { CampaignRule } from './campaignTypes';

const WALLET = '0x1111111111111111111111111111111111111111';
const CAMPAIGN_ID =
  '0x343ab6a7f875fb803e6b32cb43341b20ac71ce5eba958621fde0fd55d480b16b' as Hex;
const ACTION_TYPE =
  '0xa391054066f75f7c43647fb06ebe9f75413bc8d943fe571990a3e644f576b309' as Hex;
const TOKEN = '0x2222222222222222222222222222222222222222';
const ACTIVITY_ID = ('0x' + 'ab'.repeat(32)) as Hex;

const durableRow = (over: Record<string, unknown> = {}) => ({
  activity_id: ACTIVITY_ID,
  user_wallet: WALLET,
  kind: 'BRIDGE_SUBMITTED',
  status: 'CONFIRMED',
  source_chain_id: 97,
  destination_chain_id: 968,
  action_type: ACTION_TYPE,
  token: TOKEN,
  amount_raw: '10500000000000000000',
  campaign_id: CAMPAIGN_ID,
  occurred_at: new Date(1_700_000_000_000).toISOString(),
  ...over,
});

const demoDefinition = (rules: CampaignRule[]): CampaignDefinition[] => [
  {
    campaign: {
      campaignId: CAMPAIGN_ID,
      slug: 'bot-bridge-pioneer',
      name: 'BOT Bridge Pioneer - Testnet Pilot',
      description: null,
      status: 'published',
      startsAt: 1_600_000_000_000,
      endsAt: 1_800_000_000_000,
    },
    tasks: [
      {
        campaignId: CAMPAIGN_ID,
        taskId: 'bridge-bnb-to-bot-testnet',
        title: 'Bridge USDT from BNB Testnet to BOT Testnet',
        description: null,
        points: 250,
        requiredCount: 1,
        completionLimitPerWallet: 1,
        rules,
        sortOrder: 100,
      },
    ],
  },
];

const FROZEN_RULES: CampaignRule[] = [
  { type: 'ACTIVITY_KIND', kind: 'BRIDGE_SUBMITTED' },
  { type: 'SOURCE_CHAIN', chainId: 97 },
  { type: 'DESTINATION_CHAIN', chainId: 968 },
  { type: 'ACTION_TYPE', actionType: ACTION_TYPE },
];

describe('durable evidence reconstruction', () => {
  it('reconstructs trusted facts from a durable row', () => {
    const facts = factsFromDurableRow(durableRow());
    expect(facts).toMatchObject({
      activityId: ACTIVITY_ID,
      wallet: WALLET,
      kind: 'BRIDGE_SUBMITTED',
      status: 'CONFIRMED',
      sourceChainId: 97,
      destinationChainId: 968,
      actionType: ACTION_TYPE,
      token: TOKEN,
      amountRaw: 10_500_000_000_000_000_000n,
      campaignId: CAMPAIGN_ID,
      occurredAt: 1_700_000_000_000,
    });
  });

  it('parses bigints strictly', () => {
    expect(parseDurableBigInt('12', 'x')).toBe(12n);
    for (const bad of ['', '1.5', '-1', '0x10', 'abc', null, 12]) {
      expect(() => parseDurableBigInt(bad, 'x')).toThrow(DurableEvidenceError);
    }
  });

  it('fails closed on malformed durable rows', () => {
    for (const over of [
      { activity_id: '0xdead' },
      { user_wallet: 'nope' },
      { kind: 'BRIDGE_MAYBE' },
      { status: 'WHATEVER' },
      { source_chain_id: 0 },
      { destination_chain_id: null },
      { action_type: '0x00' },
      { token: '' },
      { amount_raw: '1e18' },
      { occurred_at: 'not-a-date' },
      { campaign_id: '0x12' },
    ]) {
      expect(() => factsFromDurableRow(durableRow(over))).toThrow(DurableEvidenceError);
    }
  });

  it('only loads CONFIRMED rows for the wallet', async () => {
    const calls: any[] = [];
    const builder: any = {
      select: (s: string) => (calls.push(['select', s]), builder),
      eq: (c: string, v: unknown) => (calls.push(['eq', c, v]), builder),
      then: (r: any) => Promise.resolve({ data: [durableRow()], error: null }).then(r),
    };
    const facts = await loadConfirmedActivitiesForWallet(WALLET.toUpperCase(), async () => ({
      from: () => builder,
      rpc: vi.fn(),
    }));
    expect(facts).toHaveLength(1);
    expect(calls).toContainEqual(['eq', 'status', 'CONFIRMED']);
    expect(calls).toContainEqual(['eq', 'user_wallet', WALLET]);
  });
});

describe('trusted settlement adapter', () => {
  const run = (rules: CampaignRule[], repository = createInMemoryCampaignCompletionRepository()) =>
    settleDurableCampaignsForWallet(WALLET, {
      loadDefinitions: async () => demoDefinition(rules),
      loadActivities: async () => [factsFromDurableRow(durableRow())],
      repository,
      now: () => 1_700_000_001_000,
    });

  it('settles the frozen demo case once for 250 PTS and replays with 0', async () => {
    const repository = createInMemoryCampaignCompletionRepository();
    const first = await run(FROZEN_RULES, repository);
    expect(first.pointsAwarded).toBe(250);
    expect(first.completions).toHaveLength(1);

    const replay = await run(FROZEN_RULES, repository);
    expect(replay.pointsAwarded).toBe(0);
    expect(replay.completions).toHaveLength(0);
    expect(repository.all()).toHaveLength(1);
  });

  it('evaluates all seven frozen rule types through the production adapter', async () => {
    const all: CampaignRule[] = [
      ...FROZEN_RULES,
      { type: 'TOKEN', token: TOKEN },
      { type: 'MIN_AMOUNT', minAmountRaw: '1' },
      { type: 'CAMPAIGN_ID', campaignId: CAMPAIGN_ID },
    ];
    expect((await run(all)).pointsAwarded).toBe(250);

    const failures: CampaignRule[][] = [
      [{ type: 'ACTIVITY_KIND', kind: 'BRIDGE_COMPLETED' }],
      [{ type: 'SOURCE_CHAIN', chainId: 56 }],
      [{ type: 'DESTINATION_CHAIN', chainId: 1 }],
      [{ type: 'ACTION_TYPE', actionType: ('0x' + '11'.repeat(32)) as Hex }],
      [{ type: 'TOKEN', token: '0x3333333333333333333333333333333333333333' }],
      [{ type: 'MIN_AMOUNT', minAmountRaw: '99999999999999999999999' }],
      [{ type: 'CAMPAIGN_ID', campaignId: ('0x' + '22'.repeat(32)) as Hex }],
    ];
    for (const rules of failures) {
      expect((await run(rules)).pointsAwarded).toBe(0);
    }
  });

  it('rejects an invalid wallet and never settles', async () => {
    await expect(settleDurableCampaignsForWallet('nope')).rejects.toThrow(DurableEvidenceError);
  });

  it('propagates settlement failure without touching durable evidence', async () => {
    const repository = createInMemoryCampaignCompletionRepository();
    const failing = {
      ...repository,
      insertCompletion: async () => {
        throw new Error('rpc down');
      },
    };
    await expect(
      settleDurableCampaignsForWallet(WALLET, {
        loadDefinitions: async () => demoDefinition(FROZEN_RULES),
        loadActivities: async () => [factsFromDurableRow(durableRow())],
        repository: failing,
      }),
    ).rejects.toThrow('rpc down');
    expect(repository.all()).toHaveLength(0);
  });

  it('writes completions only through the settlement RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: [{ inserted: true, completion_id: 'x', points_awarded: 250 }],
      error: null,
    }));
    const from = vi.fn(() => {
      const b: any = {
        select: () => b,
        eq: () => b,
        then: (r: any) => Promise.resolve({ data: [], error: null }).then(r),
      };
      return b;
    });
    const repo = createBackendCampaignCompletionRepository(async () => ({ from, rpc }) as any);
    const res = await repo.insertCompletion({
      completion: {
        completionId: ('0x' + 'cd'.repeat(32)) as Hex,
        campaignId: CAMPAIGN_ID,
        taskId: 'bridge-bnb-to-bot-testnet',
        wallet: WALLET,
        activityIds: [ACTIVITY_ID],
        points: 250,
      },
      completedAt: 1_700_000_001_000,
    });
    expect(rpc).toHaveBeenCalledWith('admin_settle_campaign_completion', expect.any(Object));
    expect(res).toEqual({ inserted: true, pointsAwarded: 250 });
  });
});

describe('verification outcome handoff', () => {
  const deps = () => ({
    loadDefinitions: async () => demoDefinition(FROZEN_RULES),
    loadActivities: async () => [factsFromDurableRow(durableRow())],
    repository: createInMemoryCampaignCompletionRepository(),
  });

  it('settles only for CONFIRMED outcomes', async () => {
    const summary = await settleCampaignsForVerificationOutcome(
      {
        status: 'CONFIRMED',
        created: true,
        activity: { user: WALLET } as any,
      } as any,
      deps(),
    );
    expect(summary?.pointsAwarded).toBe(250);
  });

  it('never settles for PENDING / REVIEW / REJECTED outcomes', async () => {
    for (const status of ['PENDING', 'REVIEW', 'REJECTED', 'REVERSED']) {
      const loadActivities = vi.fn();
      const res = await settleCampaignsForVerificationOutcome(
        { status, reason: 'x' } as any,
        { ...deps(), loadActivities },
      );
      expect(res).toBeNull();
      expect(loadActivities).not.toHaveBeenCalled();
    }
  });
});
