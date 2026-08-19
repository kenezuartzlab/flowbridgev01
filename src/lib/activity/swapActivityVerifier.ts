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
  decodeSwapActivityEvents,
  decodeSwapActivityLog,
  selectCanonicalSwapActivityLog,
  type SwapActivityLogDecoder,
} from './swapActivityEvent';
import {
  decodeApprovedSafeSwapCalldata,
  validateApprovedSafeSwapCalldata,
} from './verifiedSwapCalldata';
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
  /** Trusted source transaction (to / from / calldata). */
  getSourceTransaction: (args: {
    chainId: number;
    txHash: Hex;
  }) => Promise<SourceTransaction | null>;
  isFinalized: (args: { chainId: number; receipt: SourceReceipt }) => Promise<boolean>;
  repository: ActivityRepository;
  /** Approved swap paths. Defaults to the frozen server config. */
  paths?: readonly VerifiedSwapPath[];
  decodeLog?: SwapActivityLogDecoder;
  now?: () => number;
}

export interface SourceTransaction {
  from: Hex;
  to: Hex | null;
  input: Hex;
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

  // ---- Trusted source transaction: exact router + exact safe entrypoint ----
  let tx: SourceTransaction | null;
  try {
    tx = await deps.getSourceTransaction({
      chainId: path.chainId,
      txHash: handoff.sourceTxHash,
    });
  } catch (err) {
    return {
      status: 'PENDING',
      reason: err instanceof Error ? err.message : 'source transaction unavailable',
    };
  }
  if (!tx) return { status: 'PENDING', reason: 'no source transaction yet' };
  if (!eq(tx.from, intent.user)) {
    return { status: 'REJECTED', reason: 'source transaction sender is not the intent user' };
  }
  if (!tx.to || !eq(tx.to, path.router)) {
    return {
      status: 'REJECTED',
      reason: 'source transaction target is not the approved FlowBridgeRouter V4',
    };
  }

  const decodedCalldata = decodeApprovedSafeSwapCalldata(tx.input, path);
  if (!decodedCalldata.ok) {
    return { status: 'REJECTED', reason: decodedCalldata.reason };
  }
  const calldata = decodedCalldata.calldata;
  const calldataCheck = validateApprovedSafeSwapCalldata(calldata, {
    path,
    amount: intent.amount,
    recipient: intent.recipient.toLowerCase() as Hex,
    deadline: intent.deadline,
  });
  if (!calldataCheck.ok) {
    return { status: 'REJECTED', reason: calldataCheck.reason };
  }

  // ---- Canonical native Router V4 SwapActivity evidence -------------------
  const selection = selectCanonicalSwapActivityLog(
    decodeSwapActivityEvents(receipt, deps.decodeLog ?? decodeSwapActivityLog),
    {
      router: path.router,
      sender: intent.user.toLowerCase() as Hex,
      recipient: intent.recipient.toLowerCase() as Hex,
      routerId: path.routerId,
      tokenIn: path.tokenIn,
      // Semantic native-output proof: Router V4 emits tokenOut = address(0).
      tokenOut: path.eventTokenOut,
      amountIn: calldata.swapAmount,
    },
  );
  if (!selection.ok) {
    return selection.kind === 'ambiguous'
      ? { status: 'REVIEW', reason: selection.reason }
      : { status: 'REJECTED', reason: selection.reason };
  }
  // Semantic swap input only — protocolFee is never added to amountRaw.
  if (selection.event.amountIn !== intent.amount) {
    return { status: 'REJECTED', reason: 'SwapActivity amountIn does not equal the signed amount' };
  }
  if (selection.event.protocolFee > calldata.maxProtocolFee) {
    return {
      status: 'REJECTED',
      reason: 'SwapActivity protocolFee exceeds the user-bound maxProtocolFee',
    };
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
    // Canonical amount = SwapActivity.amountIn (semantic swap input, fee excluded).
    amountRaw: selection.event.amountIn,
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
