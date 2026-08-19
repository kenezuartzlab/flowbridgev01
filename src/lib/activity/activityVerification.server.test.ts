import { describe, expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { encodeAbiParameters, keccak256, pad, toHex } from 'viem';
import {
  buildActivityIntent,
  activityIntentTypedData,
  type ActivityIntent,
  type Hex,
} from './activityIntent';
import { activityIntentHash } from './activityCanonicalKey';
import { DIRECT_BRIDGE_ACTION_TYPE } from './activityVerifier';
import {
  confirmationsFor,
  verifyAndPersistBridgeActivity,
  assertRequiredConfirmations,
  FinalityConfigError,
  type TrustedChainReader,
} from './activityVerification.server';
import { createInMemoryActivityRepository } from './activityRepository';
import { OFFICIAL_TESTNET_ROUTES } from '../bridge/officialBridgeConfig';
import { parseConfirmations, resolveRequiredConfirmations } from './activityVerificationHandoff.server';
import { parseActivityVerifyRequest, ActivityVerifyRequestError } from './activityVerifyRequest';

const account = privateKeyToAccount(
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
);
const route = OFFICIAL_TESTNET_ROUTES[0]!; // BNB testnet -> BOT testnet
const TX = `0x${'ab'.repeat(32)}` as Hex;

function makeIntent(): ActivityIntent {
  return buildActivityIntent({
    intentId: `0x${'11'.repeat(32)}` as Hex,
    user: account.address,
    actionType: DIRECT_BRIDGE_ACTION_TYPE,
    sourceChainId: route.sourceChainId,
    destinationChainId: route.destinationChainId,
    token: route.sourceToken,
    amount: 1_000_000_000_000_000_000n,
    recipient: account.address,
    nonce: 7n,
    nowSeconds: 1_700_000_000,
  });
}

const RAW_LOG = {
  address: route.gateway,
  topics: [`0x${'cd'.repeat(32)}`] as readonly Hex[],
  data: '0x' as Hex,
  logIndex: 3,
};

/** Deterministic decoder stub — real decoding is covered by the A2 tests. */
const decodeLog = (intent: ActivityIntent) => () => ({
  logIndex: 3,
  emitter: route.gateway.toLowerCase() as Hex,
  depositor: intent.user.toLowerCase() as Hex,
  recipient: intent.recipient.toLowerCase() as Hex,
  destinationChainId: intent.destinationChainId,
  amount: intent.amount,
  token: route.sourceToken.toLowerCase() as Hex,
});

const reader = (blockNumber: bigint, latest: bigint, timestamp = 1_700_000_100): TrustedChainReader => ({
  async getSourceReceipt() {
    return { status: 'success', blockNumber, blockTimestamp: timestamp, logs: [RAW_LOG] };
  },
  async getLatestBlockNumber() {
    return latest;
  },
});

async function run(latest: bigint, requiredConfirmations: number, repo = createInMemoryActivityRepository()) {
  const intent = makeIntent();
  const signature = (await account.signTypedData(
    activityIntentTypedData(intent) as any,
  )) as Hex;
  const outcome = await verifyAndPersistBridgeActivity(
    {
      reader: reader(100n, latest),
      createRepository: () => repo,
      decodeLog: decodeLog(intent) as never,
      now: () => 1_700_000_200_000,
    },
    { intent, signature, intentHash: activityIntentHash(intent), sourceTxHash: TX },
    { requiredConfirmations },
  );
  return { outcome, repo };
}

describe('confirmationsFor', () => {
  it('counts the inclusion block as the first confirmation', () => {
    expect(confirmationsFor(100n, 100n)).toBe(1n);
    expect(confirmationsFor(105n, 100n)).toBe(6n);
  });
  it('never returns a negative count', () => {
    expect(confirmationsFor(99n, 100n)).toBe(0n);
  });
});

describe('required confirmations', () => {
  it('rejects zero, negatives and non-integers', () => {
    for (const bad of [0, -1, 1.5, undefined, '3']) {
      expect(() => assertRequiredConfirmations(bad as never)).toThrow(FinalityConfigError);
    }
    expect(assertRequiredConfirmations(3)).toBe(3);
  });

  it('parses env config and fails closed on missing/zero values', () => {
    expect(parseConfirmations('5')).toBe(5);
    for (const bad of [undefined, '', '0', '-2', 'abc', '2.5']) {
      expect(() => parseConfirmations(bad)).toThrow(FinalityConfigError);
    }
  });

  it('maps testnet source chains to their env vars', () => {
    expect(
      resolveRequiredConfirmations(97, { ACTIVITY_VERIFIER_BNB_TESTNET_CONFIRMATIONS: '4' }),
    ).toBe(4);
    expect(
      resolveRequiredConfirmations(968, { ACTIVITY_VERIFIER_BOT_TESTNET_CONFIRMATIONS: '2' }),
    ).toBe(2);
    expect(() => resolveRequiredConfirmations(1, {})).toThrow(FinalityConfigError);
    expect(() => resolveRequiredConfirmations(97, {})).toThrow(FinalityConfigError);
  });
});

describe('early intentHash rejection', () => {
  it('rejects a wrong intentHash before any source-chain RPC or persistence', async () => {
    const intent = makeIntent();
    const signature = (await account.signTypedData(
      activityIntentTypedData(intent) as any,
    )) as Hex;

    let receiptCalls = 0;
    let headCalls = 0;
    let repoCalls = 0;

    const spyReader: TrustedChainReader = {
      async getSourceReceipt() {
        receiptCalls += 1;
        return { status: 'success', blockNumber: 100n, blockTimestamp: 1_700_000_100, logs: [RAW_LOG] };
      },
      async getLatestBlockNumber() {
        headCalls += 1;
        return 200n;
      },
    };

    const outcome = await verifyAndPersistBridgeActivity(
      {
        reader: spyReader,
        createRepository: () => {
          repoCalls += 1;
          return createInMemoryActivityRepository();
        },
        decodeLog: decodeLog(intent) as never,
        now: () => 1_700_000_200_000,
      },
      {
        intent,
        signature,
        intentHash: `0x${'99'.repeat(32)}` as Hex,
        sourceTxHash: TX,
      },
      { requiredConfirmations: 5 },
    );

    expect(outcome.status).toBe('REJECTED');
    expect((outcome as any).reason).toBe('intent hash does not match the signed intent');
    expect(receiptCalls).toBe(0);
    expect(headCalls).toBe(0);
    expect(repoCalls).toBe(0);
  });
});

describe('trusted verification adapter', () => {

  it('confirms and persists once with sufficient confirmations', async () => {
    const { outcome, repo } = await run(105n, 5); // 6 confirmations
    expect(outcome.status).toBe('CONFIRMED');
    expect(repo.all()).toHaveLength(1);
    if (outcome.status === 'CONFIRMED') {
      expect(outcome.created).toBe(true);
      expect(outcome.activity.amountRaw).toBe(1_000_000_000_000_000_000n);
    }

    // Idempotent retry: same evidence, same repository -> no duplicate row.
    const again = await run(105n, 5, repo);
    expect(again.outcome.status).toBe('CONFIRMED');
    if (again.outcome.status === 'CONFIRMED') expect(again.outcome.created).toBe(false);
    expect(repo.all()).toHaveLength(1);
  });

  it('stays PENDING with one confirmation less than required', async () => {
    const { outcome } = await run(103n, 5); // 4 confirmations
    expect(outcome.status).toBe('PENDING');
  });

  it('never persists when the receipt is missing', async () => {
    const repo = createInMemoryActivityRepository();
    const intent = makeIntent();
    const signature = (await account.signTypedData(activityIntentTypedData(intent) as any)) as Hex;
    const outcome = await verifyAndPersistBridgeActivity(
      {
        reader: { async getSourceReceipt() { return null; }, async getLatestBlockNumber() { return 100n; } },
        createRepository: () => repo,
      },
      { intent, signature, intentHash: activityIntentHash(intent), sourceTxHash: TX },
      { requiredConfirmations: 1 },
    );
    expect(outcome.status).toBe('PENDING');
    expect(repo.all()).toHaveLength(0);
  });

  it('throws a finality config error when confirmations are invalid', async () => {
    await expect(run(200n, 0)).rejects.toBeInstanceOf(FinalityConfigError);
  });
});

describe('request parser authority boundaries', () => {
  const good = () => {
    const i = makeIntent();
    return {
      intent: {
        intentId: i.intentId,
        user: i.user,
        actionType: i.actionType,
        sourceChainId: i.sourceChainId.toString(),
        destinationChainId: i.destinationChainId.toString(),
        token: i.token,
        amount: i.amount.toString(),
        recipient: i.recipient,
        campaignId: i.campaignId,
        nonce: i.nonce.toString(),
        deadline: i.deadline.toString(),
      },
      signature: `0x${'11'.repeat(65)}`,
      intentHash: activityIntentHash(i),
      sourceTxHash: TX,
    };
  };

  it('accepts decimal-string bigints', () => {
    const parsed = parseActivityVerifyRequest(good());
    expect(parsed.intent.amount).toBe(1_000_000_000_000_000_000n);
    expect(parsed.intent.actionType).toBe(DIRECT_BRIDGE_ACTION_TYPE);
  });

  it('rejects JSON numbers for bigint fields', () => {
    const bad: any = good();
    bad.intent.amount = 1000;
    expect(() => parseActivityVerifyRequest(bad)).toThrow(ActivityVerifyRequestError);
  });

  it('rejects client-supplied activity facts', () => {
    for (const field of ['activityId', 'sourceLogIndex', 'amountRaw', 'status', 'points', 'campaignCompletionId']) {
      const bad: any = good();
      bad[field] = 'x';
      expect(() => parseActivityVerifyRequest(bad)).toThrow(ActivityVerifyRequestError);
    }
  });

  it('rejects malformed hex evidence', () => {
    const bad: any = good();
    bad.sourceTxHash = '0x1234';
    expect(() => parseActivityVerifyRequest(bad)).toThrow(ActivityVerifyRequestError);
  });
});

describe('handoff idempotency', () => {
  it('reuses the stored activity for a repeated canonical key', async () => {
    const repo = createInMemoryActivityRepository();
    const key = { chainId: route.sourceChainId, txHash: TX, logIndex: 3 };
    const activityId = keccak256(
      encodeAbiParameters(
        [{ type: 'uint256' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'bytes32' }],
        [BigInt(key.chainId), key.txHash, BigInt(key.logIndex), DIRECT_BRIDGE_ACTION_TYPE],
      ),
    );
    await repo.insertWithNonce({
      activity: {
        activityId,
        user: account.address.toLowerCase() as Hex,
        kind: 'BRIDGE_SUBMITTED',
        sourceChainId: key.chainId,
        sourceTxHash: TX,
        sourceLogIndex: 3,
        amountRaw: 1n,
        status: 'CONFIRMED',
        observedAt: 1,
      },
      user: account.address as Hex,
      nonce: 7n,
      key,
    });
    const existing = await repo.findByCanonicalKey(key);
    expect(existing?.activityId).toBe(activityId);
    expect(repo.all()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Production decoder binding: no deps.decodeLog override — the server module
// must bind decodeOfficialDepositLog itself.
// ---------------------------------------------------------------------------
describe('production server decoder binding', () => {
  const LIVE_GATEWAY = '0xbCAA929FdB16f5a7185C96A4Ed0CC4F25ab86E40';
  const LIVE_AMOUNT = 10110000000000000000n;
  const DEPOSIT_EVENT_TOPIC = keccak256(
    toHex('DepositEvent(address,address,uint256,uint256,address,uint256,uint256)'),
  );

  const liveRawLog = (topic0: Hex) => ({
    address: route.gateway,
    logIndex: 3,
    topics: [
      topic0,
      encodeAbiParameters([{ type: 'address' }], [account.address]) as Hex,
      encodeAbiParameters([{ type: 'address' }], [account.address]) as Hex,
      encodeAbiParameters([{ type: 'uint256' }], [LIVE_AMOUNT]) as Hex,
    ] as readonly Hex[],
    data: encodeAbiParameters(
      [{ type: 'uint256' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }],
      [LIVE_AMOUNT - 10_000_000_000_000_000n, route.sourceToken as Hex, 42n, BigInt(route.destinationChainId)],
    ) as Hex,
  });

  const liveIntent = () =>
    buildActivityIntent({
      intentId: `0x${'22'.repeat(32)}` as Hex,
      user: account.address,
      actionType: DIRECT_BRIDGE_ACTION_TYPE,
      sourceChainId: route.sourceChainId,
      destinationChainId: route.destinationChainId,
      token: route.sourceToken,
      amount: LIVE_AMOUNT,
      recipient: account.address,
      nonce: 91n,
      nowSeconds: 1_700_000_000,
    });

  async function runLive(topic0: Hex) {
    const intent = liveIntent();
    const signature = (await account.signTypedData(activityIntentTypedData(intent) as any)) as Hex;
    const repo = createInMemoryActivityRepository();
    const log = liveRawLog(topic0);
    const outcome = await verifyAndPersistBridgeActivity(
      {
        reader: {
          async getSourceReceipt() {
            return { status: 'success', blockNumber: 100n, blockTimestamp: 1_700_000_100, logs: [log] };
          },
          async getLatestBlockNumber() {
            return 110n;
          },
        },
        createRepository: () => repo,
        now: () => 1_700_000_200_000,
      },
      { intent, signature, intentHash: activityIntentHash(intent), sourceTxHash: TX },
      { requiredConfirmations: 5 },
    );
    return { outcome, repo };
  }

  it('confirms the real DepositEvent layout without any decoder override', async () => {
    const { outcome, repo } = await runLive(DEPOSIT_EVENT_TOPIC);
    expect(outcome.status).toBe('CONFIRMED');
    if (outcome.status === 'CONFIRMED') {
      expect(outcome.activity.kind).toBe('BRIDGE_SUBMITTED');
      expect(outcome.activity.sourceLogIndex).toBe(3);
      expect(outcome.activity.amountRaw).toBe(LIVE_AMOUNT);
    }
    expect(repo.all()).toHaveLength(1);
    expect(LIVE_GATEWAY.toLowerCase()).toBe(route.gateway.toLowerCase());
  });

  it('does not confirm the obsolete Deposit signature layout', async () => {
    const obsolete = keccak256(toHex('Deposit(uint256,bytes32,address,address,uint256,address)'));
    const { outcome, repo } = await runLive(obsolete);
    expect(outcome.status).not.toBe('CONFIRMED');
    expect(repo.all()).toHaveLength(0);
  });
});
