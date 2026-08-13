/**
 * Phase A2 — deterministic identity for verified activity.
 *
 * No Math.random(), no Date.now(): every identifier is a hash of stable
 * on-chain / signed evidence so a retry always reproduces the same key.
 */
import { encodeAbiParameters, hashTypedData, keccak256 } from 'viem';
import { activityIntentTypedData, type ActivityIntent, type Hex } from './activityIntent';

/** Canonical event identity: (chainId, txHash, logIndex). */
export interface CanonicalEventKey {
  chainId: number;
  txHash: Hex;
  logIndex: number;
}

export function canonicalEventKeyString(key: CanonicalEventKey): string {
  return `${key.chainId}:${key.txHash.toLowerCase()}:${key.logIndex}`;
}

/**
 * Canonical FlowBridge v3 activity identity — deliberately INDEPENDENT of any
 * particular signed intent:
 *   keccak256(abi.encode(sourceChainId, sourceTxHash, sourceLogIndex, actionType))
 * intentHash stays a separate evidence field on VerifiedActivity.
 */
export function canonicalActivityId(key: CanonicalEventKey, actionType: Hex): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'uint256' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'bytes32' }],
      [BigInt(key.chainId), key.txHash.toLowerCase() as Hex, BigInt(key.logIndex), actionType],
    ),
  );
}


/** EIP-712 digest of the Phase A1 intent (also used as intentHash). */
export function activityIntentHash(intent: ActivityIntent): Hex {
  const payload = activityIntentTypedData(intent);
  return hashTypedData({
    domain: payload.domain,
    types: payload.types,
    primaryType: payload.primaryType,
    message: payload.message,
  } as unknown as Parameters<typeof hashTypedData>[0]);
}
