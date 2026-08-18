import { describe, expect, it } from 'vitest';
import type { Hex } from '../activity/activityIntent';
import {
  campaignCompletionId,
  evaluateCampaign,
  emptyCompletionState,
} from './campaignEngine';
import { parseCampaignRules, ruleMatches, CampaignRuleError } from './campaignRules';
import { createInMemoryCampaignCompletionRepository } from './campaignCompletionRepository';
import { settleCampaignForWallet } from './campaignSettlement';
import type { Campaign, CampaignTask, VerifiedActivityFacts } from './campaignTypes';

const CAMPAIGN_ID =
  '0x343ab6a7f875fb803e6b32cb43341b20ac71ce5eba958621fde0fd55d480b16b' as Hex;
const ACTION_TYPE =
  '0xa391054066f75f7c43647fb06ebe9f75413bc8d943fe571990a3e644f576b309' as Hex;
const WALLET = '0x1111111111111111111111111111111111111111';

const campaign: Campaign = {
  campaignId: CAMPAIGN_ID,
  slug: 'bot-bridge-pioneer-testnet',
  name: 'BOT Bridge Pioneer - Testnet Pilot',
  status: 'published',
  startsAt: 1_000,
  endsAt: 9_000,
};

const task = (over: Partial<CampaignTask> = {}): CampaignTask => ({
  campaignId: CAMPAIGN_ID,
  taskId: 'bridge-bnb-to-bot-testnet',
  title: 'Bridge USDT from BNB Testnet to BOT Testnet',
  points: 250,
  requiredCount: 1,
  completionLimitPerWallet: 1,
  rules: [
    { type: 'ACTIVITY_KIND', kind: 'BRIDGE_SUBMITTED' },
    { type: 'SOURCE_CHAIN', chainId: 97 },
    { type: 'DESTINATION_CHAIN', chainId: 968 },
    { type: 'ACTION_TYPE', actionType: ACTION_TYPE },
  ],
  sortOrder: 1,
  ...over,
});

const facts = (over: Partial<VerifiedActivityFacts> = {}): VerifiedActivityFacts => ({
  activityId: `0x${'a'.repeat(64)}` as Hex,
  wallet: WALLET,
  kind: 'BRIDGE_SUBMITTED',
  status: 'CONFIRMED',
  sourceChainId: 97,
  destinationChainId: 968,
  actionType: ACTION_TYPE,
  token: '0x2222222222222222222222222222222222222222',
  amountRaw: 10_000_000n,
  occurredAt: 2_000,
  ...over,
});

const idOf = (n: number) => `0x${n.toString(16).padStart(64, '0')}` as Hex;

describe('campaignRules', () => {
  it('parses all seven rule types', () => {
    const rules = parseCampaignRules([
      { type: 'ACTIVITY_KIND', kind: 'BRIDGE_COMPLETED' },
      { type: 'SOURCE_CHAIN', chainId: 97 },
      { type: 'DESTINATION_CHAIN', chainId: 968 },
      { type: 'ACTION_TYPE', actionType: ACTION_TYPE },
      { type: 'TOKEN', token: '0xabc' },
      { type: 'MIN_AMOUNT', minAmountRaw: '100' },
      { type: 'CAMPAIGN_ID', campaignId: CAMPAIGN_ID },
    ]);
    expect(rules).toHaveLength(7);
  });

  it('rejects unknown rule types and malformed payloads', () => {
    expect(() => parseCampaignRules([{ type: 'WHATEVER' }])).toThrow(CampaignRuleError);
    expect(() => parseCampaignRules([{ type: 'MIN_AMOUNT', minAmountRaw: 100 }])).toThrow();
    expect(() => parseCampaignRules([{ type: 'SOURCE_CHAIN', chainId: '97' }])).toThrow();
  });

  it('fails closed when a required optional fact is absent', () => {
    expect(ruleMatches({ type: 'DESTINATION_CHAIN', chainId: 968 }, facts({ destinationChainId: undefined }))).toBe(false);
    expect(ruleMatches({ type: 'ACTION_TYPE', actionType: ACTION_TYPE }, facts({ actionType: undefined }))).toBe(false);
    expect(ruleMatches({ type: 'TOKEN', token: '0xabc' }, facts({ token: undefined }))).toBe(false);
    expect(ruleMatches({ type: 'MIN_AMOUNT', minAmountRaw: '1' }, facts({ amountRaw: undefined }))).toBe(false);
    expect(ruleMatches({ type: 'CAMPAIGN_ID', campaignId: CAMPAIGN_ID }, facts({ campaignId: undefined }))).toBe(false);
  });

  it('matches MIN_AMOUNT inclusively and TOKEN case-insensitively', () => {
    expect(ruleMatches({ type: 'MIN_AMOUNT', minAmountRaw: '10000000' }, facts())).toBe(true);
    expect(ruleMatches({ type: 'MIN_AMOUNT', minAmountRaw: '10000001' }, facts())).toBe(false);
    expect(ruleMatches({ type: 'TOKEN', token: '0x2222222222222222222222222222222222222222'.toUpperCase() }, facts())).toBe(true);
  });
});

describe('evaluateCampaign', () => {
  it('awards the demo task for a confirmed matching activity', () => {
    const res = evaluateCampaign({ campaign, tasks: [task()], wallet: WALLET, activities: [facts()] });
    expect(res.completions).toHaveLength(1);
    expect(res.pointsPlanned).toBe(250);
  });

  it('counts CONFIRMED only', () => {
    for (const status of ['PENDING', 'REVIEW', 'REVERSED'] as const) {
      const res = evaluateCampaign({
        campaign,
        tasks: [task()],
        wallet: WALLET,
        activities: [facts({ status })],
      });
      expect(res.completions).toHaveLength(0);
    }
  });

  it('is wallet-bound', () => {
    const res = evaluateCampaign({
      campaign,
      tasks: [task()],
      wallet: WALLET,
      activities: [facts({ wallet: '0x9999999999999999999999999999999999999999' })],
    });
    expect(res.completions).toHaveLength(0);
  });

  it('enforces the campaign window and fails closed without occurredAt', () => {
    expect(
      evaluateCampaign({ campaign, tasks: [task()], wallet: WALLET, activities: [facts({ occurredAt: 500 })] })
        .completions,
    ).toHaveLength(0);
    expect(
      evaluateCampaign({ campaign, tasks: [task()], wallet: WALLET, activities: [facts({ occurredAt: undefined })] })
        .completions,
    ).toHaveLength(0);
  });

  it('requires requiredCount distinct activities', () => {
    const t = task({ requiredCount: 2 });
    expect(
      evaluateCampaign({ campaign, tasks: [t], wallet: WALLET, activities: [facts({ activityId: idOf(1) })] })
        .completions,
    ).toHaveLength(0);
    const res = evaluateCampaign({
      campaign,
      tasks: [t],
      wallet: WALLET,
      activities: [facts({ activityId: idOf(1) }), facts({ activityId: idOf(2) })],
    });
    expect(res.completions).toHaveLength(1);
    expect(res.completions[0].activityIds).toHaveLength(2);
  });

  it('dedupes the same activityId', () => {
    const res = evaluateCampaign({
      campaign,
      tasks: [task({ requiredCount: 2 })],
      wallet: WALLET,
      activities: [facts({ activityId: idOf(1) }), facts({ activityId: idOf(1) })],
    });
    expect(res.completions).toHaveLength(0);
  });

  it('supports repeatable tasks up to the per-wallet completion limit', () => {
    const t = task({ completionLimitPerWallet: 2 });
    const res = evaluateCampaign({
      campaign,
      tasks: [t],
      wallet: WALLET,
      activities: [idOf(1), idOf(2), idOf(3)].map((activityId) => facts({ activityId })),
    });
    expect(res.completions).toHaveLength(2);
  });

  it('respects existing completions (historical evaluation + replay safety)', () => {
    const existing = emptyCompletionState();
    existing.countByTaskId['bridge-bnb-to-bot-testnet'] = 1;
    existing.usedActivityIdsByTaskId['bridge-bnb-to-bot-testnet'] = [idOf(1)];
    const res = evaluateCampaign({
      campaign,
      tasks: [task()],
      wallet: WALLET,
      activities: [facts({ activityId: idOf(1) }), facts({ activityId: idOf(2) })],
      existing,
    });
    expect(res.completions).toHaveLength(0);
  });

  it('lets one activity satisfy different tasks', () => {
    const res = evaluateCampaign({
      campaign,
      tasks: [task(), task({ taskId: 'second-task', sortOrder: 2, points: 100 })],
      wallet: WALLET,
      activities: [facts()],
    });
    expect(res.completions.map((c) => c.taskId)).toEqual([
      'bridge-bnb-to-bot-testnet',
      'second-task',
    ]);
    expect(res.pointsPlanned).toBe(350);
  });

  it('ignores unpublished campaigns', () => {
    const res = evaluateCampaign({
      campaign: { ...campaign, status: 'draft' },
      tasks: [task()],
      wallet: WALLET,
      activities: [facts()],
    });
    expect(res.completions).toHaveLength(0);
  });

  it('derives deterministic completion ids independent of activity order and wallet case', () => {
    const a = campaignCompletionId({
      campaignId: CAMPAIGN_ID,
      taskId: 'bridge-bnb-to-bot-testnet',
      wallet: WALLET,
      activityIds: [idOf(2), idOf(1)],
    });
    const b = campaignCompletionId({
      campaignId: CAMPAIGN_ID,
      taskId: 'bridge-bnb-to-bot-testnet',
      wallet: WALLET.toUpperCase().replace('0X', '0x'),
      activityIds: [idOf(1), idOf(2)],
    });
    expect(a).toBe(b);
    expect(
      campaignCompletionId({
        campaignId: CAMPAIGN_ID,
        taskId: 'other-task',
        wallet: WALLET,
        activityIds: [idOf(1), idOf(2)],
      }),
    ).not.toBe(a);
  });
});

describe('settleCampaignForWallet', () => {
  it('awards Campaign PTS once and is replay safe', async () => {
    const repository = createInMemoryCampaignCompletionRepository();
    const args = {
      campaign,
      tasks: [task()],
      wallet: WALLET,
      activities: [facts()],
      repository,
      now: () => 5_000,
    };

    const first = await settleCampaignForWallet(args);
    expect(first.inserted).toHaveLength(1);
    expect(first.pointsAwarded).toBe(250);

    const second = await settleCampaignForWallet(args);
    expect(second.inserted).toHaveLength(0);
    expect(second.pointsAwarded).toBe(0);
    expect(await repository.totalPoints({ wallet: WALLET })).toBe(250);
    expect(repository.all()).toHaveLength(1);
  });
});
