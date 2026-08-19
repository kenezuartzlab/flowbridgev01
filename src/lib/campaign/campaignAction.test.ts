import { VERIFIED_SWAP_PATHS, VERIFIED_SWAP_V1_ACTION_TYPE } from '../swap/verifiedSwapConfig';
import {
  campaignSwapActionLink,
  parseCampaignSwapActionSearchString,
  resolveCampaignTaskSwapAction, describe, expect, it } from 'vitest';
import {
  campaignActionLink,
  parseCampaignActionSearch,
  parseCampaignActionSearchString,
  resolveCampaignTaskAction,
} from './campaignAction';
import type { CampaignApiTask } from './campaignApi';

const task = (rules: unknown[]): CampaignApiTask => ({
  taskId: 'bridge-usdt',
  title: 'Bridge USDT',
  description: null,
  points: 250,
  requiredCount: 1,
  completionLimitPerWallet: 1,
  sortOrder: 0,
  rules,
});

const BNB_TESTNET_USDT = '0x5d012516D129Ab3aE7673FE32E5ABFCD9be4d086';

describe('resolveCampaignTaskAction', () => {
  it('resolves the supported BNB testnet -> BOT testnet verified bridge', () => {
    const action = resolveCampaignTaskAction(
      task([
        { type: 'ACTIVITY_KIND', kind: 'BRIDGE_SUBMITTED' },
        { type: 'SOURCE_CHAIN', chainId: 97 },
        { type: 'DESTINATION_CHAIN', chainId: 968 },
        { type: 'TOKEN', token: BNB_TESTNET_USDT },
        { type: 'MIN_AMOUNT', minAmountRaw: '10500000000000000000' },
      ]),
    );
    expect(action).toMatchObject({
      kind: 'VERIFIED_BRIDGE',
      direction: 'BNB_TO_BOT',
      sourceChainId: 97,
      destinationChainId: 968,
      isMainnet: false,
      tokenLabel: 'USDT',
      minAmountLabel: '10.5',
    });
  });

  it('fails closed on an unknown rule type', () => {
    expect(
      resolveCampaignTaskAction(
        task([
          { type: 'ACTIVITY_KIND', kind: 'BRIDGE_SUBMITTED' },
          { type: 'SOURCE_CHAIN', chainId: 97 },
          { type: 'DESTINATION_CHAIN', chainId: 968 },
          { type: 'SOCIAL_FOLLOW', handle: 'x' },
        ]),
      ),
    ).toBeNull();
  });

  it('fails closed on an unsupported chain pair', () => {
    expect(
      resolveCampaignTaskAction(
        task([
          { type: 'ACTIVITY_KIND', kind: 'BRIDGE_SUBMITTED' },
          { type: 'SOURCE_CHAIN', chainId: 1 },
          { type: 'DESTINATION_CHAIN', chainId: 968 },
        ]),
      ),
    ).toBeNull();
  });

  it('fails closed when the TOKEN rule is not the official source token', () => {
    expect(
      resolveCampaignTaskAction(
        task([
          { type: 'ACTIVITY_KIND', kind: 'BRIDGE_SUBMITTED' },
          { type: 'SOURCE_CHAIN', chainId: 97 },
          { type: 'DESTINATION_CHAIN', chainId: 968 },
          { type: 'TOKEN', token: '0x000000000000000000000000000000000000dEaD' },
        ]),
      ),
    ).toBeNull();
  });

  it('requires an ACTIVITY_KIND rule', () => {
    expect(
      resolveCampaignTaskAction(
        task([
          { type: 'SOURCE_CHAIN', chainId: 97 },
          { type: 'DESTINATION_CHAIN', chainId: 968 },
        ]),
      ),
    ).toBeNull();
  });
});

describe('campaign action deep links', () => {
  const action = resolveCampaignTaskAction(
    task([
      { type: 'ACTIVITY_KIND', kind: 'BRIDGE_SUBMITTED' },
      { type: 'SOURCE_CHAIN', chainId: 97 },
      { type: 'DESTINATION_CHAIN', chainId: 968 },
    ]),
  )!;

  it('builds only safe presentation params', () => {
    const link = campaignActionLink({ slug: 'bot-bridge-pioneer' }, { taskId: 'bridge-usdt' }, action);
    expect(link).toEqual({
      mode: 'bridge',
      direction: 'BNB_TO_BOT',
      source: 97,
      destination: 968,
      campaign: 'bot-bridge-pioneer',
      task: 'bridge-usdt',
    });
    expect(Object.keys(link)).not.toContain('gateway');
  });

  it('round-trips a valid search', () => {
    const link = campaignActionLink({ slug: 'bot-bridge-pioneer' }, { taskId: 'bridge-usdt' }, action);
    expect(parseCampaignActionSearch(link)).toEqual(link);
  });

  it('rejects a direction/chain mismatch', () => {
    expect(
      parseCampaignActionSearch({
        mode: 'bridge',
        direction: 'BOT_TO_BNB',
        source: 97,
        destination: 968,
        campaign: 'c',
        task: 't',
      }),
    ).toBeNull();
  });

  it('rejects unsupported chains and unsafe identifiers', () => {
    expect(
      parseCampaignActionSearch({
        mode: 'bridge',
        direction: 'BNB_TO_BOT',
        source: 1,
        destination: 968,
        campaign: 'c',
        task: 't',
      }),
    ).toBeNull();
    expect(
      parseCampaignActionSearch({
        mode: 'bridge',
        direction: 'BNB_TO_BOT',
        source: 97,
        destination: 968,
        campaign: '<script>',
        task: 't',
      }),
    ).toBeNull();
  });

  it('ignores injected contract/authority params from a tampered URL', () => {
    const parsed = parseCampaignActionSearchString(
      '?mode=bridge&direction=BNB_TO_BOT&source=97&destination=968&campaign=c&task=t' +
        '&gateway=0x000000000000000000000000000000000000dEaD&points=999999&completed=1',
    );
    expect(parsed).toEqual({
      mode: 'bridge',
      direction: 'BNB_TO_BOT',
      source: 97,
      destination: 968,
      campaign: 'c',
      task: 't',
    });
  });

  it('returns null for a non-campaign search string', () => {
    expect(parseCampaignActionSearchString('?foo=bar')).toBeNull();
  });
});

describe('V8 verified swap deep link', () => {
  const path = VERIFIED_SWAP_PATHS[0]!;
  const swapTask = {
    taskId: 'verified-swap',
    title: 'Swap',
    points: 100,
    requiredCount: 1,
    completionLimitPerWallet: 1,
    rules: [
      { type: 'ACTIVITY_KIND', kind: 'SWAP_EXECUTED' },
      { type: 'SOURCE_CHAIN', chainId: path.chainId },
      { type: 'DESTINATION_CHAIN', chainId: path.chainId },
      { type: 'ACTION_TYPE', actionType: VERIFIED_SWAP_V1_ACTION_TYPE },
      { type: 'TOKEN', token: path.tokenIn },
    ],
  } as any;

  it('resolves a supported swap task', () => {
    const action = resolveCampaignTaskSwapAction(swapTask);
    expect(action?.kind).toBe('VERIFIED_SWAP');
    expect(action?.chainId).toBe(path.chainId);
  });

  it('fails closed on an unapproved chain', () => {
    const action = resolveCampaignTaskSwapAction({
      ...swapTask,
      rules: [
        { type: 'ACTIVITY_KIND', kind: 'SWAP_EXECUTED' },
        { type: 'SOURCE_CHAIN', chainId: 12345 },
      ],
    });
    expect(action).toBeNull();
  });

  it('round-trips a validated swap link', () => {
    const action = resolveCampaignTaskSwapAction(swapTask)!;
    const link = campaignSwapActionLink({ slug: 'demo' } as any, swapTask, action);
    const params = new URLSearchParams(
      Object.entries(link).map(([k, v]) => [k, String(v)]),
    ).toString();
    expect(parseCampaignSwapActionSearchString(`?${params}`)).toEqual(link);
  });

  it('rejects an unknown swap token', () => {
    expect(
      parseCampaignSwapActionSearchString(
        `?mode=swap&chain=${path.chainId}&token=0x2222222222222222222222222222222222222222&campaign=demo&task=t`,
      ),
    ).toBeNull();
  });
});
