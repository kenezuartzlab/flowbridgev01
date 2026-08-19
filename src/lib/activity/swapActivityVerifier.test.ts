import { describe, expect, it, vi } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData } from 'viem';
import { buildActivityIntent, type Hex } from './activityIntent';
import { activityIntentHash } from './activityCanonicalKey';
import { createInMemoryActivityRepository } from './activityRepository';
import type { ActivityIntentHandoff } from './activityVerifier';
import { DIRECT_BRIDGE_ACTION_TYPE } from './activityVerifier';
import type { RawLog, SourceReceipt } from './officialBridgeEvent';
import { SWAP_ACTIVITY_EVENT_ABI } from './swapActivityEvent';
import {
  verifySwapActivity,
  type SourceTransaction,
  type SwapVerifierDeps,
} from './swapActivityVerifier';
import { FLOW_BRIDGE_ROUTER_V4_ABI } from '../flowbridge/routerV4Abi';
import { VERIFIED_SWAP_PATHS, VERIFIED_SWAP_V1_ACTION_TYPE } from '../swap/verifiedSwapConfig';

const PATH = VERIFIED_SWAP_PATHS[0]!;
const USER = '0x1111111111111111111111111111111111111111' as Hex;
const OTHER = '0x2222222222222222222222222222222222222222' as Hex;
const TX = ('0x' + 'cd'.repeat(32)) as Hex;
const AMOUNT = 12_500000n;
const MAX_FEE = 12_500n;
const DEADLINE = 1_700_000_000n + 300n;

function activityLog(
  over: Partial<{
    emitter: string;
    sender: Hex;
    recipient: Hex;
    routerId: bigint;
    tokenIn: Hex;
    tokenOut: Hex;
    amountIn: bigint;
    amountOut: bigint;
    protocolFee: bigint;
    logIndex: number;
  }> = {},
): RawLog {
  const sender = over.sender ?? USER;
  const recipient = over.recipient ?? USER;
  const routerId = over.routerId ?? PATH.routerId;
  const topics = encodeEventTopics({
    abi: SWAP_ACTIVITY_EVENT_ABI,
    eventName: 'SwapActivity',
    args: { sender, recipient, routerId },
  }) as readonly Hex[];
  return {
    address: over.emitter ?? PATH.router,
    logIndex: over.logIndex ?? 7,
    topics,
    data: encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'address' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'uint256' },
      ],
      [
        over.tokenIn ?? PATH.tokenIn,
        over.tokenOut ?? PATH.tokenOut,
        over.amountIn ?? AMOUNT,
        over.amountOut ?? 5_000_000_000_000_000_000n,
        over.protocolFee ?? 0n,
      ],
    ) as Hex,
  };
}

function safeCalldata(
  over: Partial<{
    routerId: bigint;
    swapAmount: bigint;
    path: readonly Hex[];
    to: Hex;
    deadline: bigint;
    maxProtocolFee: bigint;
  }> = {},
): Hex {
  return encodeFunctionData({
    abi: FLOW_BRIDGE_ROUTER_V4_ABI,
    functionName: 'swapV2Safe',
    args: [
      over.routerId ?? PATH.routerId,
      over.swapAmount ?? AMOUNT,
      1n,
      (over.path ?? [PATH.tokenIn, PATH.tokenOut]) as readonly Hex[],
      over.to ?? USER,
      over.deadline ?? DEADLINE,
      over.maxProtocolFee ?? MAX_FEE,
    ],
  }) as Hex;
}

const legacyCalldata = (): Hex =>
  encodeFunctionData({
    abi: FLOW_BRIDGE_ROUTER_V4_ABI,
    functionName: 'swapV2',
    args: [PATH.routerId, AMOUNT, 1n, [PATH.tokenIn, PATH.tokenOut], USER, DEADLINE],
  }) as Hex;

const wrongSafeCalldata = (): Hex =>
  encodeFunctionData({
    abi: FLOW_BRIDGE_ROUTER_V4_ABI,
    functionName: 'swapV3SingleSafe',
    args: [PATH.routerId, PATH.tokenIn, PATH.tokenOut, 3000, AMOUNT, 1n, USER, DEADLINE, MAX_FEE],
  }) as Hex;

function intentFor(over: Partial<Parameters<typeof buildActivityIntent>[0]> = {}) {
  return buildActivityIntent({
    intentId: ('0x' + 'ba'.repeat(32)) as Hex,
    user: USER,
    actionType: VERIFIED_SWAP_V1_ACTION_TYPE,
    sourceChainId: PATH.chainId,
    destinationChainId: PATH.chainId,
    token: PATH.tokenIn,
    amount: AMOUNT,
    recipient: USER,
    nonce: 11n,
    nowSeconds: 1_700_000_000,
    ...over,
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

const receipt = (logs: RawLog[], over: Partial<SourceReceipt> = {}): SourceReceipt => ({
  status: 'success',
  blockTimestamp: 1_700_000_100,
  logs,
  ...over,
});

const tx = (over: Partial<SourceTransaction> = {}): SourceTransaction => ({
  from: USER,
  to: PATH.router,
  input: safeCalldata(),
  ...over,
});

const deps = (r: SourceReceipt | null, over: Partial<SwapVerifierDeps> = {}): SwapVerifierDeps => ({
  recoverTypedDataSigner: vi.fn(async () => USER),
  getSourceReceipt: vi.fn(async () => r),
  getSourceTransaction: vi.fn(async () => tx()),
  isFinalized: vi.fn(async () => true),
  repository: createInMemoryActivityRepository(),
  now: () => 1_700_000_500,
  ...over,
});

const ok = () => receipt([activityLog()]);

describe('V8.1 verified swap soundness (Router V4 SwapActivity evidence)', () => {
  it('confirms SWAP_EXECUTED from the unique matching SwapActivity log', async () => {
    const out = await verifySwapActivity(deps(ok()), handoff());
    expect(out.status).toBe('CONFIRMED');
    if (out.status !== 'CONFIRMED') return;
    expect(out.activity.kind).toBe('SWAP_EXECUTED');
    expect(out.activity.amountRaw).toBe(AMOUNT);
    expect(out.activity.sourceLogIndex).toBe(7);
    expect(out.created).toBe(true);
  });

  it('uses SwapActivity.amountIn (fee excluded) as amountRaw', async () => {
    const out = await verifySwapActivity(
      deps(receipt([activityLog({ protocolFee: 1_000n })])),
      handoff(),
    );
    expect(out.status).toBe('CONFIRMED');
    if (out.status !== 'CONFIRMED') return;
    expect(out.activity.amountRaw).toBe(AMOUNT);
  });

  it('rejects a wrong tx.from', async () => {
    const out = await verifySwapActivity(
      deps(ok(), { getSourceTransaction: async () => tx({ from: OTHER }) }),
      handoff(),
    );
    expect(out.status).toBe('REJECTED');
  });

  it('rejects a wrong tx.to', async () => {
    const out = await verifySwapActivity(
      deps(ok(), { getSourceTransaction: async () => tx({ to: OTHER }) }),
      handoff(),
    );
    expect(out.status).toBe('REJECTED');
  });

  it('rejects a legacy non-safe entrypoint', async () => {
    const out = await verifySwapActivity(
      deps(ok(), { getSourceTransaction: async () => tx({ input: legacyCalldata() }) }),
      handoff(),
    );
    expect(out.status).toBe('REJECTED');
  });

  it('rejects a different safe function than the approved path', async () => {
    const out = await verifySwapActivity(
      deps(ok(), { getSourceTransaction: async () => tx({ input: wrongSafeCalldata() }) }),
      handoff(),
    );
    expect(out.status).toBe('REJECTED');
  });

  it('rejects a wrong calldata routerId', async () => {
    const out = await verifySwapActivity(
      deps(ok(), {
        getSourceTransaction: async () => tx({ input: safeCalldata({ routerId: 1n }) }),
      }),
      handoff(),
    );
    expect(out.status).toBe('REJECTED');
  });

  it('rejects a wrong path start (token-in)', async () => {
    const out = await verifySwapActivity(
      deps(ok(), {
        getSourceTransaction: async () =>
          tx({ input: safeCalldata({ path: [OTHER, PATH.tokenOut] }) }),
      }),
      handoff(),
    );
    expect(out.status).toBe('REJECTED');
  });

  it('rejects a wrong path end (token-out)', async () => {
    const out = await verifySwapActivity(
      deps(ok(), {
        getSourceTransaction: async () =>
          tx({ input: safeCalldata({ path: [PATH.tokenIn, OTHER] }) }),
      }),
      handoff(),
    );
    expect(out.status).toBe('REJECTED');
  });

  it('rejects calldata swapAmount that differs from the signed intent', async () => {
    const out = await verifySwapActivity(
      deps(ok(), {
        getSourceTransaction: async () => tx({ input: safeCalldata({ swapAmount: AMOUNT + 1n }) }),
      }),
      handoff(),
    );
    expect(out.status).toBe('REJECTED');
  });

  it('rejects a calldata recipient that is not the signer', async () => {
    const out = await verifySwapActivity(
      deps(ok(), { getSourceTransaction: async () => tx({ input: safeCalldata({ to: OTHER }) }) }),
      handoff(),
    );
    expect(out.status).toBe('REJECTED');
  });

  it('rejects SwapActivity.amountIn that differs from calldata swapAmount', async () => {
    const out = await verifySwapActivity(
      deps(receipt([activityLog({ amountIn: AMOUNT - 1n })])),
      handoff(),
    );
    expect(out.status).toBe('REJECTED');
  });

  it('rejects a SwapActivity sender mismatch', async () => {
    const out = await verifySwapActivity(deps(receipt([activityLog({ sender: OTHER })])), handoff());
    expect(out.status).toBe('REJECTED');
  });

  it('rejects a SwapActivity recipient mismatch', async () => {
    const out = await verifySwapActivity(
      deps(receipt([activityLog({ recipient: OTHER })])),
      handoff(),
    );
    expect(out.status).toBe('REJECTED');
  });

  it('rejects a SwapActivity routerId mismatch', async () => {
    const out = await verifySwapActivity(deps(receipt([activityLog({ routerId: 1n })])), handoff());
    expect(out.status).toBe('REJECTED');
  });

  it('rejects a SwapActivity emitted by another contract', async () => {
    const out = await verifySwapActivity(deps(receipt([activityLog({ emitter: OTHER })])), handoff());
    expect(out.status).toBe('REJECTED');
  });

  it('rejects protocolFee above the user-bound maxProtocolFee', async () => {
    const out = await verifySwapActivity(
      deps(receipt([activityLog({ protocolFee: MAX_FEE + 1n })])),
      handoff(),
    );
    expect(out.status).toBe('REJECTED');
  });

  it('ignores gross ERC-20 transfer value: a below-threshold amountIn stays canonical', async () => {
    const small = 1_000n;
    const out = await verifySwapActivity(
      deps(receipt([activityLog({ amountIn: small, protocolFee: 5n })]), {
        getSourceTransaction: async () => tx({ input: safeCalldata({ swapAmount: small }) }),
      }),
      handoff(intentFor({ amount: small })),
    );
    expect(out.status).toBe('CONFIRMED');
    if (out.status !== 'CONFIRMED') return;
    // MIN_AMOUNT is evaluated against this value, never amountIn + protocolFee.
    expect(out.activity.amountRaw).toBe(small);
  });

  it('fails closed on multiple candidate SwapActivity logs', async () => {
    const out = await verifySwapActivity(
      deps(receipt([activityLog({ logIndex: 7 }), activityLog({ logIndex: 9 })])),
      handoff(),
    );
    expect(out.status).toBe('REVIEW');
  });

  it('rejects a bridge action type', async () => {
    const out = await verifySwapActivity(
      deps(ok()),
      handoff(intentFor({ actionType: DIRECT_BRIDGE_ACTION_TYPE })),
    );
    expect(out.status).toBe('REJECTED');
  });

  it('rejects a cross-chain intent', async () => {
    const out = await verifySwapActivity(deps(ok()), handoff(intentFor({ destinationChainId: 97 })));
    expect(out.status).toBe('REJECTED');
  });

  it('rejects a recipient that is not the signer', async () => {
    const out = await verifySwapActivity(deps(ok()), handoff(intentFor({ recipient: OTHER })));
    expect(out.status).toBe('REJECTED');
  });

  it('rejects an unapproved token-in', async () => {
    const out = await verifySwapActivity(deps(ok()), handoff(intentFor({ token: OTHER })));
    expect(out.status).toBe('REJECTED');
  });

  it('a signed intent with no receipt is never confirmed', async () => {
    const out = await verifySwapActivity(deps(null), handoff());
    expect(out.status).toBe('PENDING');
  });

  it('does not confirm until finalized', async () => {
    const out = await verifySwapActivity(deps(ok(), { isFinalized: async () => false }), handoff());
    expect(out.status).toBe('PENDING');
  });

  it('rejects a reverted source transaction', async () => {
    const out = await verifySwapActivity(
      deps(receipt([activityLog()], { status: 'reverted' })),
      handoff(),
    );
    expect(out.status).toBe('REJECTED');
  });

  it('is idempotent for the same canonical event', async () => {
    const repository = createInMemoryActivityRepository();
    const r = ok();
    const first = await verifySwapActivity(deps(r, { repository }), handoff());
    const second = await verifySwapActivity(deps(r, { repository }), handoff());
    expect(first.status).toBe('CONFIRMED');
    expect(second.status).toBe('CONFIRMED');
    if (second.status !== 'CONFIRMED') return;
    expect(second.created).toBe(false);
  });

  it('rejects a nonce already consumed by a different event', async () => {
    const repository = createInMemoryActivityRepository();
    await verifySwapActivity(deps(ok(), { repository }), handoff());
    const other = await verifySwapActivity(
      deps(receipt([activityLog({ logIndex: 12 })]), { repository }),
      { ...handoff(), sourceTxHash: ('0x' + 'ef'.repeat(32)) as Hex },
    );
    expect(other.status).toBe('REJECTED');
  });

  it('rejects a tampered intent hash before any chain work', async () => {
    const getSourceReceipt = vi.fn(async () => ok());
    const out = await verifySwapActivity(deps(ok(), { getSourceReceipt }), {
      ...handoff(),
      intentHash: ('0x' + '11'.repeat(32)) as Hex,
    });
    expect(out.status).toBe('REJECTED');
    expect(getSourceReceipt).not.toHaveBeenCalled();
  });

  it('rejects a signature recovered to another address', async () => {
    const out = await verifySwapActivity(
      deps(ok(), { recoverTypedDataSigner: async () => OTHER }),
      handoff(),
    );
    expect(out.status).toBe('REJECTED');
  });
});
