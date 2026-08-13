import { describe, expect, it, vi } from 'vitest';
import {
  ACTIVITY_INTENT_TYPES,
  activityIntentDomain,
  activityIntentTypedData,
  buildActivityIntent,
  captureActivityIntent,
  isActivityIntentEnabled,
  rewardsFromSignedIntent,
  ZERO_BYTES32,
  type Hex,
} from './activityIntent';

const USER = '0x1111111111111111111111111111111111111111' as Hex;
const TOKEN = '0x5d012516D129Ab3aE7673FE32E5ABFCD9be4d086' as Hex;
const args = {
  intentId: ('0x' + 'ab'.repeat(32)) as Hex,
  user: USER,
  actionType: ('0x' + 'cd'.repeat(32)) as Hex,
  sourceChainId: 97,
  destinationChainId: 968,
  token: TOKEN,
  amount: 10_500000000000000000n,
  recipient: USER,
  nonce: 7n,
  nowSeconds: 1_700_000_000,
};

describe('Phase A1 Activity Intent scaffold', () => {
  it('is disabled by default', () => {
    expect(isActivityIntentEnabled()).toBe(false);
  });

  it('builds a single-use intent with a finite deadline', () => {
    const intent = buildActivityIntent(args);
    expect(intent.nonce).toBe(7n);
    expect(intent.deadline).toBe(BigInt(args.nowSeconds + 15 * 60));
    expect(intent.campaignId).toBe(ZERO_BYTES32);
  });

  it('rejects a non-positive amount and non-finite ttl', () => {
    expect(() => buildActivityIntent({ ...args, amount: 0n })).toThrow();
    expect(() => buildActivityIntent({ ...args, ttlSeconds: 0 })).toThrow();
  });

  it('uses a source-chain-specific EIP-712 domain and the spec field order', () => {
    const payload = activityIntentTypedData(buildActivityIntent(args));
    expect(payload.domain).toEqual(activityIntentDomain(97));
    expect(payload.domain.chainId).toBe(97);
    expect(ACTIVITY_INTENT_TYPES.FlowBridgeActivityIntent.map((f) => f.name)).toEqual([
      'intentId',
      'user',
      'actionType',
      'sourceChainId',
      'destinationChainId',
      'token',
      'amount',
      'recipient',
      'campaignId',
      'nonce',
      'deadline',
    ]);
  });

  it('stores the signed intent before returning, and is never completed', async () => {
    const order: string[] = [];
    const state = await captureActivityIntent(
      {
        attributionEnabled: true,
        signTypedData: async () => {
          order.push('sign');
          return '0xsig' as Hex;
        },
        storeSignedIntent: async () => {
          order.push('store');
        },
      },
      args,
    );
    expect(order).toEqual(['sign', 'store']);
    expect(state.status).toBe('signed');
    if (state.status === 'signed') expect(state.completed).toBe(false);
  });

  it('a signed intent grants zero XP / PTS / FLOW', async () => {
    const state = await captureActivityIntent(
      { attributionEnabled: true, signTypedData: async () => '0xsig' as Hex },
      args,
    );
    expect(rewardsFromSignedIntent(state)).toEqual({ xp: 0, pts: 0, flow: 0 });
    expect(rewardsFromSignedIntent({ status: 'unavailable', reason: 'x' })).toEqual({
      xp: 0,
      pts: 0,
      flow: 0,
    });
  });

  it('degrades to unavailable instead of throwing when signing fails', async () => {
    const sign = vi.fn(async () => {
      throw new Error('user rejected');
    });
    const state = await captureActivityIntent({ attributionEnabled: true, signTypedData: sign }, args);
    expect(state).toEqual({ status: 'unavailable', reason: 'user rejected' });
  });

  it('does not prompt at all when attribution is disabled', async () => {
    const sign = vi.fn(async () => '0xsig' as Hex);
    const state = await captureActivityIntent({ attributionEnabled: false, signTypedData: sign }, args);
    expect(sign).not.toHaveBeenCalled();
    expect(state.status).toBe('unavailable');
  });
});
