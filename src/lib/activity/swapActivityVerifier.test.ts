import { describe, expect, it, vi } from 'vitest';
import { encodeAbiParameters, keccak256, toHex } from 'viem';
import { buildActivityIntent, type Hex } from './activityIntent';
import { activityIntentHash } from './activityCanonicalKey';
import { createInMemoryActivityRepository } from './activityRepository';
import type { ActivityIntentHandoff } from './activityVerifier';
import { DIRECT_BRIDGE_ACTION_TYPE } from './activityVerifier';
import type { RawLog, SourceReceipt } from './officialBridgeEvent';
import { verifySwapActivity, type SwapVerifierDeps } from './swapActivityVerifier';
import { VERIFIED_SWAP_PATHS, VERIFIED_SWAP_V1_ACTION_TYPE } from '../swap/verifiedSwapConfig';

const PATH = VERIFIED_SWAP_PATHS[0]!;
const USER = '0x1111111111111111111111111111111111111111' as Hex;
const OTHER = '0x2222222222222222222222222222222222222222' as Hex;
const TX = ('0x' + 'cd'.repeat(32)) as Hex;
const AMOUNT = 12_500000n;

const TRANSFER_TOPIC = keccak256(toHex('Transfer(address,address,uint256)'));

function transferLog(args: {
  emitter?: string;
  from?: Hex;
  to?: string;
  value?: bigint;
  logIndex?: number;
}): RawLog {
  return {
    address: args.emitter ?? PATH.tokenIn,
    logIndex: args.logIndex ?? 5,
    topics: [
      TRANSFER_TOPIC,
      encodeAbiParameters([{ type: 'address' }], [args.from ?? USER]) as Hex,
      encodeAbiParameters([{ type: 'address' }], [(args.to ?? PATH.router) as Hex]) as Hex,
    ],
    data: encodeAbiParameters([{ type: 'uint256' }], [args.value ?? AMOUNT]) as Hex,
  };
}

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

const deps = (r: SourceReceipt | null, over: Partial<SwapVerifierDeps> = {}): SwapVerifierDeps => ({
  recoverTypedDataSigner: vi.fn(async () => USER),
  getSourceReceipt: vi.fn(async () => r),
  isFinalized: vi.fn(async () => true),
  repository: createInMemoryActivityRepository(),
  now: () => 1_700_000_500,
  ...over,
});

describe('V8 verified swap adapter', () => {
  it('confirms SWAP_EXECUTED from the canonical token-in transfer to the router', async () => {
    const out = await verifySwapActivity(deps(receipt([transferLog({})])), handoff());
    expect(out.status).toBe('CONFIRMED');
    if (out.status !== 'CONFIRMED') return;
    expect(out.activity.kind).toBe('SWAP_EXECUTED');
    expect(out.activity.amountRaw).toBe(AMOUNT);
    expect(out.activity.sourceLogIndex).toBe(5);
    expect(out.created).toBe(true);
  });

  it('rejects a bridge action type', async () => {
    const out = await verifySwapActivity(
      deps(receipt([transferLog({})])),
      handoff(intentFor({ actionType: DIRECT_BRIDGE_ACTION_TYPE })),
    );
    expect(out.status).toBe('REJECTED');
  });

  it('rejects a cross-chain intent', async () => {
    const out = await verifySwapActivity(
      deps(receipt([transferLog({})])),
      handoff(intentFor({ destinationChainId: 97 })),
    );
    expect(out.status).toBe('REJECTED');
  });

  it('rejects a recipient that is not the signer', async () => {
    const out = await verifySwapActivity(
      deps(receipt([transferLog({})])),
      handoff(intentFor({ recipient: OTHER })),
    );
    expect(out.status).toBe('REJECTED');
  });

  it('rejects an unapproved token-in', async () => {
    const out = await verifySwapActivity(
      deps(receipt([transferLog({})])),
      handoff(intentFor({ token: OTHER })),
    );
    expect(out.status).toBe('REJECTED');
  });

  it('a signed intent with no receipt is never confirmed', async () => {
    const out = await verifySwapActivity(deps(null), handoff());
    expect(out.status).toBe('PENDING');
  });

  it('does not confirm until finalized', async () => {
    const out = await verifySwapActivity(
      deps(receipt([transferLog({})]), { isFinalized: async () => false }),
      handoff(),
    );
    expect(out.status).toBe('PENDING');
  });

  it('rejects a transfer that went somewhere other than the router', async () => {
    const out = await verifySwapActivity(
      deps(receipt([transferLog({ to: OTHER })])),
      handoff(),
    );
    expect(out.status).toBe('REJECTED');
  });

  it('rejects a client amount that does not match the on-chain transfer', async () => {
    const out = await verifySwapActivity(
      deps(receipt([transferLog({ value: AMOUNT + 1n })])),
      handoff(),
    );
    expect(out.status).toBe('REJECTED');
  });

  it('flags ambiguous duplicate matching transfers for review', async () => {
    const out = await verifySwapActivity(
      deps(receipt([transferLog({ logIndex: 5 }), transferLog({ logIndex: 9 })])),
      handoff(),
    );
    expect(out.status).toBe('REVIEW');
  });

  it('is idempotent for the same canonical event', async () => {
    const repository = createInMemoryActivityRepository();
    const r = receipt([transferLog({})]);
    const first = await verifySwapActivity(deps(r, { repository }), handoff());
    const second = await verifySwapActivity(deps(r, { repository }), handoff());
    expect(first.status).toBe('CONFIRMED');
    expect(second.status).toBe('CONFIRMED');
    if (second.status !== 'CONFIRMED') return;
    expect(second.created).toBe(false);
  });

  it('rejects a nonce already consumed by a different event', async () => {
    const repository = createInMemoryActivityRepository();
    await verifySwapActivity(deps(receipt([transferLog({})]), { repository }), handoff());
    const other = await verifySwapActivity(
      deps(receipt([transferLog({ logIndex: 12, value: AMOUNT })]), { repository }),
      { ...handoff(), sourceTxHash: ('0x' + 'ef'.repeat(32)) as Hex },
    );
    expect(other.status).toBe('REJECTED');
  });

  it('rejects a tampered intent hash', async () => {
    const h = handoff();
    const out = await verifySwapActivity(deps(receipt([transferLog({})])), {
      ...h,
      intentHash: ('0x' + '11'.repeat(32)) as Hex,
    });
    expect(out.status).toBe('REJECTED');
  });

  it('rejects a signature recovered to another address', async () => {
    const out = await verifySwapActivity(
      deps(receipt([transferLog({})]), { recoverTypedDataSigner: async () => OTHER }),
      handoff(),
    );
    expect(out.status).toBe('REJECTED');
  });
});
