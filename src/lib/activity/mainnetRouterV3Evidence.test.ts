import { describe, expect, it } from 'vitest';
import { encodeAbiParameters, pad, keccak256, toBytes } from 'viem';
import {
  MAINNET_ROUTER_V3_ADDRESS,
  scanEvidenceCollisions,
  verifyMainnetRouterV3CoreSwap,
  findMainnetRouterV3EvidencePath,
  type RouterV3ReceiptEvidence,
} from './mainnetRouterV3Evidence';
import {
  ROUTER_V3_SWAP_EXECUTED_SIGNATURE,
  ROUTER_V3_SWAP_EXECUTED_TOPIC,
} from './routerV3SwapEvent';

const WALLET = '0x3d8a7fa490f9db09dd8006b74688213ace9c0164';
const TOKEN = '0x55d398326f99059ff775485246999027b3197955';
const TX = '0x396b25fd9e4e66c8189ed139681da280a8d9fc43df3e8854a14649cb760c0516';

function swapLog(opts: {
  logIndex: number;
  emitter?: string;
  sender?: string;
  recipient?: string;
  amount?: bigint;
}) {
  return {
    address: opts.emitter ?? MAINNET_ROUTER_V3_ADDRESS,
    topics: [
      ROUTER_V3_SWAP_EXECUTED_TOPIC,
      pad('0x03', { size: 32 }),
      pad(TOKEN as `0x${string}`, { size: 32 }),
      pad('0x00', { size: 32 }),
    ] as readonly `0x${string}`[],
    data: encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'address' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'uint256' },
      ],
      [
        (opts.sender ?? WALLET) as `0x${string}`,
        (opts.recipient ?? WALLET) as `0x${string}`,
        opts.amount ?? 1_000_000_000_000_000_000n,
        990_000_000_000_000_000n,
        1_000_000_000_000_000n,
      ],
    ),
    logIndex: opts.logIndex,
  };
}

const evidence = (over: Partial<RouterV3ReceiptEvidence> = {}): RouterV3ReceiptEvidence => ({
  chainId: 677,
  txHash: TX,
  from: WALLET,
  to: MAINNET_ROUTER_V3_ADDRESS,
  status: 'success',
  blockNumber: 20_400_804,
  transactionIndex: 0,
  blockTimestamp: 1_780_000_000,
  logs: [swapLog({ logIndex: 5 })],
  ...over,
});

describe('Router v3 evidence signature', () => {
  it('matches the deployed SwapExecuted topic0', () => {
    expect(ROUTER_V3_SWAP_EXECUTED_TOPIC).toBe(
      keccak256(toBytes(ROUTER_V3_SWAP_EXECUTED_SIGNATURE)),
    );
    expect(ROUTER_V3_SWAP_EXECUTED_TOPIC).toBe(
      '0x927ca8b36d4e2f5dfd8714cd69677b2deda6f17ad7ed9b304b6525a1643d9b46',
    );
  });

  it('exposes chain 677 as an evidence-only path', () => {
    const p = findMainnetRouterV3EvidencePath(677);
    expect(p?.executionEnabled).toBe(false);
    expect(findMainnetRouterV3EvidencePath(968)).toBeUndefined();
    expect(findMainnetRouterV3EvidencePath(1024)).toBeUndefined();
  });
});

describe('verifyMainnetRouterV3CoreSwap', () => {
  it('resolves the ACTUAL receipt log index and canonical identity', () => {
    const r = verifyMainnetRouterV3CoreSwap(evidence(), { expectedWallet: WALLET });
    expect(r.status).toBe('VERIFIED');
    if (r.status !== 'VERIFIED') return;
    expect(r.activity.logIndex).toBe(5);
    expect(r.activity.activityKey).toBe(`677:${TX}:5`);
    expect(r.activity.amountRaw).toBe(1_000_000_000_000_000_000n);
  });

  it('is deterministic', () => {
    const a = verifyMainnetRouterV3CoreSwap(evidence());
    const b = verifyMainnetRouterV3CoreSwap(evidence());
    expect(JSON.stringify(a, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).toBe(
      JSON.stringify(b, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
    );
  });

  it('ignores unrelated logs and never assumes log index 0', () => {
    const r = verifyMainnetRouterV3CoreSwap(
      evidence({
        logs: [
          { address: TOKEN, topics: ['0xdead'.padEnd(66, '0') as `0x${string}`], data: '0x', logIndex: 0 },
          swapLog({ logIndex: 8 }),
        ],
      }),
    );
    expect(r.status === 'VERIFIED' && r.activity.logIndex).toBe(8);
  });

  it.each([
    ['wrong chain', evidence({ chainId: 968 })],
    ['wrong router target', evidence({ to: TOKEN })],
    ['reverted tx', evidence({ status: 'reverted' })],
    ['no matching log', evidence({ logs: [] })],
    ['zero amount', evidence({ logs: [swapLog({ logIndex: 5, amount: 0n })] })],
    ['foreign emitter', evidence({ logs: [swapLog({ logIndex: 5, emitter: TOKEN })] })],
    ['actor mismatch', evidence({ logs: [swapLog({ logIndex: 5, sender: TOKEN })] })],
  ])('fails closed: %s', (_label, ev) => {
    expect(verifyMainnetRouterV3CoreSwap(ev).status).toBe('REJECTED');
  });

  it('fails closed on ambiguous duplicate matches', () => {
    const r = verifyMainnetRouterV3CoreSwap(
      evidence({ logs: [swapLog({ logIndex: 5 }), swapLog({ logIndex: 6 })] }),
    );
    expect(r.status).toBe('REJECTED');
    expect(r.status === 'REJECTED' && r.reason).toMatch(/ambiguous/);
  });

  it('rejects a wallet that did not send the transaction', () => {
    expect(
      verifyMainnetRouterV3CoreSwap(evidence(), { expectedWallet: TOKEN }).status,
    ).toBe('REJECTED');
  });
});

describe('scanEvidenceCollisions', () => {
  it('passes for distinct identities', () => {
    expect(
      scanEvidenceCollisions([
        { ledgerId: 'a', activityKey: `677:${TX}:5` },
        { ledgerId: 'b', activityKey: `677:${TX}:8` },
      ]).ok,
    ).toBe(true);
  });

  it('stops when two ledger rows collapse onto one identity', () => {
    const r = scanEvidenceCollisions([
      { ledgerId: 'a', activityKey: `677:${TX}:5` },
      { ledgerId: 'b', activityKey: `677:${TX}:5` },
    ]);
    expect(r.ok).toBe(false);
    expect(r.collisions[0]?.ledgerIds).toEqual(['a', 'b']);
  });
});
