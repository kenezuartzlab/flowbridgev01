import { describe, expect, it } from 'vitest';
import { encodeAbiParameters, keccak256 } from 'viem';
import { canonicalActivityId, type CanonicalEventKey } from './activityCanonicalKey';
import type { Hex } from './activityIntent';

const KEY: CanonicalEventKey = {
  chainId: 97,
  txHash: ('0x' + 'ee'.repeat(32)) as Hex,
  logIndex: 3,
};
const ACTION = ('0x' + '00'.repeat(32)) as Hex;
const OTHER_ACTION = ('0x' + '00'.repeat(31) + '01') as Hex;
const INTENT_A = ('0x' + 'aa'.repeat(32)) as Hex;
const INTENT_B = ('0x' + 'bb'.repeat(32)) as Hex;

describe('Phase A2.1 canonical activityId parity', () => {
  it('equals keccak256(abi.encode(chainId, txHash, logIndex, actionType))', () => {
    expect(canonicalActivityId(KEY, ACTION)).toBe(
      keccak256(
        encodeAbiParameters(
          [{ type: 'uint256' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'bytes32' }],
          [97n, KEY.txHash, 3n, ACTION],
        ),
      ),
    );
  });

  it('is identical regardless of intentHash (intent is not part of identity)', () => {
    const a = canonicalActivityId(KEY, ACTION);
    const b = canonicalActivityId(KEY, ACTION);
    expect(a).toBe(b);
    // intentHash values never feed the derivation at all
    expect(a).not.toBe(INTENT_A);
    expect(a).not.toBe(INTENT_B);
  });

  it('different actionType produces a different activityId', () => {
    expect(canonicalActivityId(KEY, OTHER_ACTION)).not.toBe(canonicalActivityId(KEY, ACTION));
  });

  it('different logIndex, txHash or chainId produces a different activityId', () => {
    expect(canonicalActivityId({ ...KEY, logIndex: 4 }, ACTION)).not.toBe(
      canonicalActivityId(KEY, ACTION),
    );
    expect(
      canonicalActivityId({ ...KEY, txHash: ('0x' + 'cc'.repeat(32)) as Hex }, ACTION),
    ).not.toBe(canonicalActivityId(KEY, ACTION));
    expect(canonicalActivityId({ ...KEY, chainId: 968 }, ACTION)).not.toBe(
      canonicalActivityId(KEY, ACTION),
    );
  });

  it('is case-insensitive on the tx hash', () => {
    expect(
      canonicalActivityId({ ...KEY, txHash: KEY.txHash.toUpperCase().replace('0XEE', '0xee') as Hex }, ACTION),
    ).toBe(canonicalActivityId(KEY, ACTION));
  });
});
