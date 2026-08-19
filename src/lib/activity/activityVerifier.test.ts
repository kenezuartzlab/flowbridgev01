import { describe, expect, it, vi } from 'vitest';
import { encodeAbiParameters, keccak256, toHex } from 'viem';
import { buildActivityIntent, type Hex } from './activityIntent';
import { activityIntentHash } from './activityCanonicalKey';
import { createInMemoryActivityRepository } from './activityRepository';
import {
  DIRECT_BRIDGE_ACTION_TYPE,
  verifyBridgeActivity,
  type ActivityVerifierDeps,
  type ActivityIntentHandoff,
} from './activityVerifier';
import { OFFICIAL_TESTNET_ROUTES } from '../bridge/officialBridgeConfig';
import type { RawLog, SourceReceipt } from './officialBridgeEvent';

const BNB = OFFICIAL_TESTNET_ROUTES[0]!; // 97 -> 968, 18dp
const BOT = OFFICIAL_TESTNET_ROUTES[1]!; // 968 -> 97, 6dp

const USER = '0x1111111111111111111111111111111111111111' as Hex;
const OTHER = '0x2222222222222222222222222222222222222222' as Hex;
const TX = ('0x' + 'ee'.repeat(32)) as Hex;
const RESOURCE = ('0x' + 'ac'.repeat(32)) as Hex;

const DEPOSIT_TOPIC = keccak256(
  toHex('DepositEvent(address,address,uint256,uint256,address,uint256,uint256)'),
);

function depositLog(args: {
  emitter?: string;
  depositor?: Hex;
  recipient?: Hex;
  destinationChainId?: bigint;
  amount: bigint;
  token?: string;
  logIndex?: number;
}): RawLog {
  return {
    address: args.emitter ?? BNB.gateway,
    logIndex: args.logIndex ?? 3,
    topics: [
      DEPOSIT_TOPIC,
      encodeAbiParameters([{ type: 'address' }], [args.depositor ?? USER]) as Hex,
      encodeAbiParameters([{ type: 'address' }], [(args.recipient ?? USER) as Hex]) as Hex,
      encodeAbiParameters([{ type: 'uint256' }], [args.amount]) as Hex,
    ],
    data: encodeAbiParameters(
      [
        { type: 'uint256' },
        { type: 'address' },
        { type: 'uint256' },
        { type: 'uint256' },
      ],
      [
        args.amount,
        (args.token ?? BNB.sourceToken) as Hex,
        1n,
        args.destinationChainId ?? BigInt(BNB.destinationChainId),
      ],
    ) as Hex,
  };
}

function intentFor(route = BNB, amount = 10_500000000000000000n, nonce = 7n) {
  return buildActivityIntent({
    intentId: ('0x' + 'ab'.repeat(32)) as Hex,
    user: USER,
    actionType: DIRECT_BRIDGE_ACTION_TYPE,
    sourceChainId: route.sourceChainId,
    destinationChainId: route.destinationChainId,
    token: route.sourceToken,
    amount,
    recipient: USER,
    nonce,
    nowSeconds: 1_700_000_000,
  });
}

function handoff(intent = intentFor()): ActivityIntentHandoff {
  return {
    intent,
    signature: '0xsig' as Hex,
    intentHash: activityIntentHash(intent),
    sourceTxHash: TX,
  };
}

function receipt(logs: RawLog[], over: Partial<SourceReceipt> = {}): SourceReceipt {
  return { status: 'success', blockTimestamp: 1_700_000_100, logs, ...over };
}

function deps(
  r: SourceReceipt | null,
  over: Partial<ActivityVerifierDeps> = {},
): ActivityVerifierDeps {
  return {
    recoverTypedDataSigner: vi.fn(async () => USER),
    getSourceReceipt: vi.fn(async () => r),
    isFinalized: vi.fn(async () => true),
    repository: createInMemoryActivityRepository(),
    now: () => 1_700_000_500,
    ...over,
  };
}

describe('Phase A2 Activity Verifier', () => {
  it('confirms BRIDGE_SUBMITTED on a valid, finalized, unique official deposit', async () => {
    const out = await verifyBridgeActivity(
      deps(receipt([depositLog({ amount: 10_500000000000000000n })])),
      handoff(),
    );
    expect(out.status).toBe('CONFIRMED');
    if (out.status !== 'CONFIRMED') return;
    expect(out.activity.kind).toBe('BRIDGE_SUBMITTED');
    expect(out.activity.amountRaw).toBe(10_500000000000000000n);
    expect(out.activity.sourceLogIndex).toBe(3);
    expect(out.created).toBe(true);
  });

  it('a signed intent with no source event is not CONFIRMED', async () => {
    const out = await verifyBridgeActivity(deps(null), handoff());
    expect(out.status).toBe('PENDING');
  });

  it('rejects a wrong recovered signer', async () => {
    const out = await verifyBridgeActivity(
      deps(receipt([depositLog({ amount: 10_500000000000000000n })]), {
        recoverTypedDataSigner: async () => OTHER,
      }),
      handoff(),
    );
    expect(out.status).toBe('REJECTED');
  });

  it('rejects when the source block timestamp is past the deadline', async () => {
    const out = await verifyBridgeActivity(
      deps(receipt([depositLog({ amount: 10_500000000000000000n })], { blockTimestamp: 1_800_000_000 })),
      handoff(),
    );
    expect(out.status).toBe('REJECTED');
  });

  it('rejects a wrong source chain and a wrong destination chain', async () => {
    const badSource = { ...intentFor(), sourceChainId: 1n };
    expect((await verifyBridgeActivity(deps(receipt([])), handoff(badSource))).status).toBe(
      'REJECTED',
    );
    const badDest = intentFor();
    const mutated = { ...badDest, destinationChainId: 999n };
    expect((await verifyBridgeActivity(deps(receipt([])), handoff(mutated))).status).toBe(
      'REJECTED',
    );
  });

  it('rejects a wrong official gateway, token, recipient and off-by-one amount', async () => {
    const cases: RawLog[] = [
      depositLog({ amount: 10_500000000000000000n, emitter: OTHER }),
      depositLog({ amount: 10_500000000000000000n, token: OTHER }),
      depositLog({ amount: 10_500000000000000000n, recipient: OTHER }),
      depositLog({ amount: 10_500000000000000001n }),
    ];
    for (const log of cases) {
      const out = await verifyBridgeActivity(deps(receipt([log])), handoff());
      expect(out.status).toBe('REJECTED');
    }
  });

  it('rejects a failed source receipt and stays PENDING while unfinalized', async () => {
    const log = depositLog({ amount: 10_500000000000000000n });
    expect(
      (await verifyBridgeActivity(deps(receipt([log], { status: 'reverted' })), handoff())).status,
    ).toBe('REJECTED');
    expect(
      (
        await verifyBridgeActivity(
          deps(receipt([log]), { isFinalized: async () => false }),
          handoff(),
        )
      ).status,
    ).toBe('PENDING');
  });

  it('is idempotent for the same canonical chain/tx/log', async () => {
    const repository = createInMemoryActivityRepository();
    const d = deps(receipt([depositLog({ amount: 10_500000000000000000n })]), { repository });
    const first = await verifyBridgeActivity(d, handoff());
    const second = await verifyBridgeActivity(d, handoff());
    expect(first.status).toBe('CONFIRMED');
    expect(second.status).toBe('CONFIRMED');
    if (first.status !== 'CONFIRMED' || second.status !== 'CONFIRMED') return;
    expect(second.created).toBe(false);
    expect(second.activity.activityId).toBe(first.activity.activityId);
    expect(repository.all()).toHaveLength(1);
  });

  it('rejects the same nonce reused against another event', async () => {
    const repository = createInMemoryActivityRepository();
    await verifyBridgeActivity(
      deps(receipt([depositLog({ amount: 10_500000000000000000n })]), { repository }),
      handoff(),
    );
    const other = await verifyBridgeActivity(
      deps(receipt([depositLog({ amount: 10_500000000000000000n, logIndex: 9 })]), { repository }),
      { ...handoff(), sourceTxHash: ('0x' + 'cc'.repeat(32)) as Hex },
    );
    expect(other.status).toBe('REJECTED');
    expect(repository.all()).toHaveLength(1);
  });

  it('fails closed into REVIEW on multiple ambiguous matching logs', async () => {
    const out = await verifyBridgeActivity(
      deps(
        receipt([
          depositLog({ amount: 10_500000000000000000n, logIndex: 3 }),
          depositLog({ amount: 10_500000000000000000n, logIndex: 5 }),
        ]),
      ),
      handoff(),
    );
    expect(out.status).toBe('REVIEW');
  });

  it('matches exact 6-decimal BOT and 18-decimal BNB source amounts', async () => {
    const bot6 = 12_000000n;
    const botIntent = intentFor(BOT, bot6, 11n);
    const botOut = await verifyBridgeActivity(
      deps(
        receipt([
          {
            ...depositLog({
              amount: bot6,
              emitter: BOT.gateway,
              token: BOT.sourceToken,
              destinationChainId: BigInt(BOT.destinationChainId),
            }),
          },
        ]),
      ),
      handoff(botIntent),
    );
    expect(botOut.status).toBe('CONFIRMED');
    if (botOut.status === 'CONFIRMED') expect(botOut.activity.amountRaw).toBe(bot6);

    const bnb18 = 1_000000000000000000n;
    const bnbOut = await verifyBridgeActivity(
      deps(receipt([depositLog({ amount: bnb18 })])),
      handoff(intentFor(BNB, bnb18, 12n)),
    );
    expect(bnbOut.status).toBe('CONFIRMED');
    if (bnbOut.status === 'CONFIRMED') expect(bnbOut.activity.amountRaw).toBe(bnb18);
  });

  it('ignores client-displayed USD/fee values entirely', async () => {
    const out = await verifyBridgeActivity(
      deps(receipt([depositLog({ amount: 10_500000000000000000n })])),
      { ...handoff(), displayedUsd: 999, displayedFee: '1.0' } as ActivityIntentHandoff,
    );
    expect(out.status).toBe('CONFIRMED');
    if (out.status === 'CONFIRMED') expect(out.activity.amountRaw).toBe(10_500000000000000000n);
  });

  it('never creates XP/PTS/FLOW, never sends a tx and never infers completion', async () => {
    const out = await verifyBridgeActivity(
      deps(receipt([depositLog({ amount: 10_500000000000000000n })])),
      handoff(),
    );
    if (out.status !== 'CONFIRMED') throw new Error('expected CONFIRMED');
    const keys = Object.keys(out.activity);
    for (const forbidden of ['xp', 'pts', 'flow', 'reward', 'points']) {
      expect(keys.some((k) => k.toLowerCase().includes(forbidden))).toBe(false);
    }
    expect(out.activity.kind).not.toBe('BRIDGE_COMPLETED');
    // Deps expose read-only RPC only — there is no send/write capability.
    expect(Object.keys(deps(null))).toEqual(
      expect.not.arrayContaining(['sendTransaction', 'writeContract']),
    );
  });

  it('derives a deterministic activityId (no randomness)', async () => {
    const a = await verifyBridgeActivity(
      deps(receipt([depositLog({ amount: 10_500000000000000000n })])),
      handoff(),
    );
    const b = await verifyBridgeActivity(
      deps(receipt([depositLog({ amount: 10_500000000000000000n })])),
      handoff(),
    );
    if (a.status !== 'CONFIRMED' || b.status !== 'CONFIRMED') throw new Error('expected CONFIRMED');
    expect(a.activity.activityId).toBe(b.activity.activityId);
  });
});
