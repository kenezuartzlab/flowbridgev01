/**
 * Phase A2 — storage boundary for verified activity.
 *
 * A2 introduces NO new database vendor: this is an injectable repository
 * interface plus an in-memory/test implementation. localStorage is never the
 * canonical ledger.
 */
import type { Hex } from './activityIntent';
import { canonicalEventKeyString, type CanonicalEventKey } from './activityCanonicalKey';

export type VerifiedActivityKind = 'BRIDGE_SUBMITTED' | 'BRIDGE_COMPLETED' | 'SWAP_EXECUTED';
export type VerifiedActivityStatus = 'PENDING' | 'CONFIRMED' | 'REVIEW' | 'REVERSED';

export interface VerifiedActivity {
  activityId: Hex;
  user: Hex;
  kind: VerifiedActivityKind;
  sourceChainId: number;
  sourceTxHash: Hex;
  sourceLogIndex: number;
  /** Gross source amount in SOURCE token base units, as decoded on-chain. */
  amountRaw: bigint;
  campaignId?: Hex;
  intentHash?: Hex;
  status: VerifiedActivityStatus;
  observedAt: number;
}

export interface ActivityRepository {
  findByCanonicalKey(key: CanonicalEventKey): Promise<VerifiedActivity | null>;
  isNonceUsed(user: Hex, nonce: bigint): Promise<boolean>;
  /**
   * Atomically consumes the intent nonce AND inserts the activity. If either
   * the nonce is already used or the canonical key exists, the existing record
   * is returned instead of creating a duplicate.
   */
  insertWithNonce(args: {
    activity: VerifiedActivity;
    user: Hex;
    nonce: bigint;
    key: CanonicalEventKey;
  }): Promise<{ inserted: boolean; activity: VerifiedActivity }>;
}

const nonceKey = (user: Hex, nonce: bigint) => `${user.toLowerCase()}:${nonce.toString()}`;

export function createInMemoryActivityRepository(): ActivityRepository & {
  all(): VerifiedActivity[];
} {
  const byKey = new Map<string, VerifiedActivity>();
  const usedNonces = new Set<string>();

  return {
    all: () => [...byKey.values()],
    async findByCanonicalKey(key) {
      return byKey.get(canonicalEventKeyString(key)) ?? null;
    },
    async isNonceUsed(user, nonce) {
      return usedNonces.has(nonceKey(user, nonce));
    },
    async insertWithNonce({ activity, user, nonce, key }) {
      const k = canonicalEventKeyString(key);
      const existing = byKey.get(k);
      if (existing) return { inserted: false, activity: existing };
      if (usedNonces.has(nonceKey(user, nonce))) {
        throw new Error('intent nonce already consumed');
      }
      usedNonces.add(nonceKey(user, nonce));
      byKey.set(k, activity);
      return { inserted: true, activity };
    },
  };
}
