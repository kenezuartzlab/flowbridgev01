/**
 * Phase A2 — deterministic identity for verified activity.
 *
 * No Math.random(), no Date.now(): every identifier is a hash of stable
 * on-chain / signed evidence so a retry always reproduces the same key.
 */
import { hashTypedData, keccak256, toHex } from 'viem';
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

/** Deterministic activityId derived only from the canonical event key. */
export function canonicalActivityId(key: CanonicalEventKey): Hex {
  return keccak256(toHex(canonicalEventKeyString(key)));
}

/** EIP-712 digest of the Phase A1 intent (also used as intentHash). */
export function activityIntentHash(intent: ActivityIntent): Hex {
  const payload = activityIntentTypedData(intent);
  return hashTypedData({
    domain: payload.domain,
    types: payload.types,
    primaryType: payload.primaryType,
    message: payload.message,
  } as Parameters<typeof hashTypedData>[0]);
}
