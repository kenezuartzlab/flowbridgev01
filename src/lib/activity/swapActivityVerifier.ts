/**
 * V8 — deterministic Verified Swap Adapter (pure logic).
 *
 * Rules (identical trust posture to the bridge verifier, fail closed):
 *   SIGNED INTENT ALONE      = NO VERIFIED ACTIVITY
 *   CLIENT-SUBMITTED AMOUNT  = NEVER CANONICAL
 *   SOURCE TX HASH ALONE     = NOT ENOUGH
 *
 * It never sends a transaction, never awards XP / PTS / FLOW and never settles
 * a campaign. It produces one canonical SWAP_EXECUTED evidence record derived
 * from the on-chain token-in Transfer log to the configured router.
 */
import { activityIntentTypedData, ZERO_BYTES32, type Hex } from './activityIntent';
import { activityIntentHash, canonicalActivityId, type CanonicalEventKey } from './activityCanonicalKey';
import type { SourceReceipt } from './officialBridgeEvent';
import {
  decodeErc20TransferLog,
  decodeTransferEvents,
  selectCanonicalSwapTransferLog,
  type TransferLogDecoder,
} from './swapTransferEvent';
import type { ActivityRepository, VerifiedActivity } from './activityRepository';
import type { ActivityIntentHandoff, VerificationOutcome } from './activityVerifier';
import { ZERO_ADDRESS } from './activityVerifier';
import {
  VERIFIED_SWAP_PATHS,
  VERIFIED_SWAP_V1_ACTION_TYPE,
  type VerifiedSwapPath,
} from '../swap/verifiedSwapConfig';

export interface SwapVerifierDeps {
  recoverTypedDataSigner: (args: {
    payload: ReturnType<typeof activityIntentTypedData>;
    signature: Hex;
  }) => Promise<string>;
  getSourceReceipt: (args: { chainId: number; txHash: Hex }) => Promise<SourceReceipt | null>;
  isFinalized: (args: { chainId: number; receipt: SourceReceipt }) => Promise<boolean>;
  repository: ActivityRepository;
  /** Approved swap paths. Defaults to the frozen server config. */
  paths?: readonly VerifiedSwapPath[];
  decodeLog?: TransferLogDecoder;
  now?: () => number;
}

const eq = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export async function verifySwapActivity(
  deps: SwapVerifierDeps,
  handoff: ActivityIntentHandoff,
): Promise<VerificationOutcome> {
  const { intent, signature } = handoff;
  const paths = deps.paths ?? VERIFIED_SWAP_PATHS;

  // ---- Intent shape ------------------------------------------------------
  if (!eq(intent.actionType, VERIFIED_SWAP_V1_ACTION_TYPE)) {
    return { status: 'REJECTED', reason: 'unsupported activity action type' };
  }
  if (intent.actionType === ZERO_BYTES32) {
    return { status: 'REJECTED', reason: 'action type must not be zero' };
  }
  if (eq(intent.user, ZERO_ADDRESS) || eq(intent.recipient, ZERO_ADDRESS)) {
    return { status: 'REJECTED', reason: 'user and recipient must be non-zero' };
  }
  if (!eq(intent.user, intent.recipient)) {
    return { status: 'REJECTED', reason: 'verified swap requires recipient to be the signer' };
  }
  if (intent.amount <= 0n) {
    return { status: 'REJECTED', reason: 'intent amount must be positive' };
  }
  if (intent.sourceChainId !== intent.destinationChainId) {
    return { status: 'REJECTED', reason: 'verified swap must be a same-chain action' };
  }

  const path = paths.find(
    (p) => p.chainId === Number(intent.sourceChainId) && eq(p.tokenIn, intent.token),
  );
  if (!path) {
    return { status: 'REJECTED', reason: 'not an approved verified swap path' };
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
    receipt = await deps.getSourceReceipt({ chainId: path.chainId, txHash: handoff.sourceTxHash });
  } catch (err) {
    return {
      status: 'PENDING',
      reason: err instanceof Error ? err.message : 'source receipt unavailable',
    };
  }
  if (!receipt) return { status: 'PENDING', reason: 'no source transaction receipt yet' };
  if (receipt.status !== 'success') {
    return { status: 'REJECTED', reason: 'source transaction reverted' };
  }
  if (BigInt(Math.floor(receipt.blockTimestamp)) > intent.deadline) {
    return { status: 'REJECTED', reason: 'source block timestamp is after the signed deadline' };
  }

  const finalized = await deps.isFinalized({ chainId: path.chainId, receipt });
  if (!finalized) return { status: 'PENDING', reason: 'source transaction not finalized yet' };

  // ---- Canonical token-in transfer --------------------------------------
  const selection = selectCanonicalSwapTransferLog(
    decodeTransferEvents(receipt, deps.decodeLog ?? decodeErc20TransferLog),
    {
      token: path.tokenIn,
      from: intent.user.toLowerCase() as Hex,
      to: path.router,
      value: intent.amount,
    },
  );
  if (!selection.ok) {
    return selection.kind === 'ambiguous'
      ? { status: 'REVIEW', reason: selection.reason }
      : { status: 'REJECTED', reason: selection.reason };
  }

  const key: CanonicalEventKey = {
    chainId: path.chainId,
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
    kind: 'SWAP_EXECUTED',
    sourceChainId: key.chainId,
    sourceTxHash: key.txHash,
    sourceLogIndex: key.logIndex,
    // Canonical amount comes from the decoded Transfer log, never the client.
    amountRaw: selection.event.value,
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
