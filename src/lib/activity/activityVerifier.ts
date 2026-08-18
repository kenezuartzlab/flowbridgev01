/**
 * Phase A2 — deterministic Activity Verifier / Indexer foundation.
 *
 * Rules (fail closed):
 *   SIGNED INTENT ALONE      = NO VERIFIED ACTIVITY
 *   CLIENT-SUBMITTED AMOUNT  = NEVER CANONICAL
 *   SOURCE TX HASH ALONE     = NOT ENOUGH
 *
 * The verifier NEVER sends a transaction, never writes to an Activity Registry
 * and never awards XP / PTS / FLOW. It produces verified evidence only, and it
 * never infers destination completion from a source confirmation.
 */
import {
  activityIntentTypedData,
  type ActivityIntent,
  type Hex,
} from './activityIntent';
import { activityIntentHash, canonicalActivityId, type CanonicalEventKey } from './activityCanonicalKey';
import {
  decodeDepositEvents,
  selectCanonicalDepositLog,
  type DepositLogDecoder,
  type SourceReceipt,
} from './officialBridgeEvent';
import type { ActivityRepository, VerifiedActivity } from './activityRepository';
import {
  OFFICIAL_TESTNET_ROUTES,
  type OfficialBridgeRoute,
} from '../bridge/officialBridgeConfig';
import { ZERO_BYTES32 } from './activityIntent';

/**
 * Frozen direct-bridge action tag. NEVER zero bytes32.
 * keccak256 tag agreed for the official BOT<->BNB direct bridge.
 */
export const DIRECT_BRIDGE_ACTION_TYPE: Hex =
  '0xa391054066f75f7c43647fb06ebe9f75413bc8d943fe571990a3e644f576b309';


export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/** Minimal client→verifier handoff, sent once the source tx hash is known. */
export interface ActivityIntentHandoff {
  intent: ActivityIntent;
  signature: Hex;
  intentHash: Hex;
  sourceTxHash: Hex;
}

export interface ActivityVerifierDeps {
  /** Recovers the signer of the Phase A1 typed data. */
  recoverTypedDataSigner: (args: {
    payload: ReturnType<typeof activityIntentTypedData>;
    signature: Hex;
  }) => Promise<string>;
  /** Finalized source receipt, or null when the tx is not visible yet. */
  getSourceReceipt: (args: { chainId: number; txHash: Hex }) => Promise<SourceReceipt | null>;
  /** Configurable per-chain finality policy — never hardcode 1 confirmation. */
  isFinalized: (args: { chainId: number; receipt: SourceReceipt }) => Promise<boolean>;
  repository: ActivityRepository;
  /** Approved official direct-bridge routes. Defaults to the testnet corridor. */
  routes?: readonly OfficialBridgeRoute[];
  decodeLog?: DepositLogDecoder;
  /** Injected clock for `observedAt` (evidence timestamp only, never identity). */
  now?: () => number;
}

export type VerificationOutcome =
  | { status: 'CONFIRMED'; activity: VerifiedActivity; created: boolean }
  | { status: 'PENDING'; reason: string }
  | { status: 'REVIEW'; reason: string }
  | { status: 'REJECTED'; reason: string };

const eq = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export async function verifyBridgeActivity(
  deps: ActivityVerifierDeps,
  handoff: ActivityIntentHandoff,
): Promise<VerificationOutcome> {
  const { intent, signature } = handoff;
  const routes = deps.routes ?? OFFICIAL_TESTNET_ROUTES;

  // ---- Intent shape ------------------------------------------------------
  if (intent.actionType !== DIRECT_BRIDGE_ACTION_TYPE) {
    return { status: 'REJECTED', reason: 'unsupported activity action type' };
  }
  if (eq(intent.user, ZERO_ADDRESS) || eq(intent.recipient, ZERO_ADDRESS)) {
    return { status: 'REJECTED', reason: 'user and recipient must be non-zero' };
  }
  if (intent.amount <= 0n) {
    return { status: 'REJECTED', reason: 'intent amount must be positive' };
  }

  const route = routes.find(
    (r) =>
      r.sourceChainId === Number(intent.sourceChainId) &&
      r.destinationChainId === Number(intent.destinationChainId) &&
      eq(r.sourceToken, intent.token),
  );
  if (!route) {
    return { status: 'REJECTED', reason: 'not an approved official direct-bridge route' };
  }

  // ---- Intent hash + signature ------------------------------------------
  const computedHash = activityIntentHash(intent);
  if (!eq(computedHash, handoff.intentHash)) {
    return { status: 'REJECTED', reason: 'intent hash does not match the signed intent' };
  }
  let signer: string;
  try {
    signer = await deps.recoverTypedDataSigner({
      payload: activityIntentTypedData(intent),
      signature,
    });
  } catch (err) {
    return {
      status: 'REVIEW',
      reason: err instanceof Error ? err.message : 'signature recovery failed',
    };
  }
  if (!eq(signer, intent.user)) {
    return { status: 'REJECTED', reason: 'recovered signer is not the intent user' };
  }

  // ---- Source receipt ----------------------------------------------------
  let receipt: SourceReceipt | null;
  try {
    receipt = await deps.getSourceReceipt({
      chainId: route.sourceChainId,
      txHash: handoff.sourceTxHash,
    });
  } catch (err) {
    return {
      status: 'PENDING',
      reason: err instanceof Error ? err.message : 'source receipt unavailable',
    };
  }
  if (!receipt) {
    return { status: 'PENDING', reason: 'no source transaction receipt yet' };
  }
  if (receipt.status !== 'success') {
    return { status: 'REJECTED', reason: 'source transaction reverted' };
  }
  if (BigInt(Math.floor(receipt.blockTimestamp)) > intent.deadline) {
    return { status: 'REJECTED', reason: 'source block timestamp is after the signed deadline' };
  }

  const finalized = await deps.isFinalized({ chainId: route.sourceChainId, receipt });
  if (!finalized) {
    return { status: 'PENDING', reason: 'source transaction not finalized yet' };
  }

  // ---- Canonical official event -----------------------------------------
  const selection = selectCanonicalDepositLog(decodeDepositEvents(receipt, deps.decodeLog), {
    gateway: route.gateway,
    depositor: intent.user,
    recipient: intent.recipient,
    destinationChainId: intent.destinationChainId,
    amount: intent.amount,
    token: route.sourceToken,
  });
  if (!selection.ok) {
    return selection.kind === 'ambiguous'
      ? { status: 'REVIEW', reason: selection.reason }
      : { status: 'REJECTED', reason: selection.reason };
  }

  const key: CanonicalEventKey = {
    chainId: route.sourceChainId,
    txHash: handoff.sourceTxHash,
    logIndex: selection.event.logIndex,
  };

  // ---- Idempotency + atomic nonce consumption ---------------------------
  const existing = await deps.repository.findByCanonicalKey(key);
  if (existing) return { status: 'CONFIRMED', activity: existing, created: false };

  if (await deps.repository.isNonceUsed(intent.user, intent.nonce)) {
    return { status: 'REJECTED', reason: 'intent nonce already consumed by another event' };
  }

  const activity: VerifiedActivity = {
    activityId: canonicalActivityId(key, intent.actionType),
    user: intent.user.toLowerCase() as Hex,
    kind: 'BRIDGE_SUBMITTED',
    sourceChainId: key.chainId,
    sourceTxHash: key.txHash,
    sourceLogIndex: key.logIndex,
    // Canonical amount comes from the decoded event, never from the client.
    amountRaw: selection.event.amount,
    campaignId: intent.campaignId,
    intentHash: computedHash,
    status: 'CONFIRMED',
    observedAt: (deps.now ?? Date.now)(),
  };

  try {
    const result = await deps.repository.insertWithNonce({
      activity,
      user: intent.user,
      nonce: intent.nonce,
      key,
    });
    return { status: 'CONFIRMED', activity: result.activity, created: result.inserted };
  } catch (err) {
    return {
      status: 'REVIEW',
      reason: err instanceof Error ? err.message : 'verified activity could not be stored',
    };
  }
}
