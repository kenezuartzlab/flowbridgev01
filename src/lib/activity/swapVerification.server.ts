/**
 * V8 — SERVER-ONLY trusted adapter around the pure `verifySwapActivity` logic.
 *
 * Router, token-in and chain are taken ONLY from the frozen server config; the
 * browser can never name them. Confirmation policy is required (no default) and
 * CONFIRMED evidence is persisted exclusively through
 * public.admin_record_verified_activity(...).
 */
import { recoverTypedDataAddress } from 'viem';
import type { Hex } from './activityIntent';
import { activityIntentHash } from './activityCanonicalKey';
import type { ActivityIntentHandoff, VerificationOutcome } from './activityVerifier';
import type { SourceReceipt } from './officialBridgeEvent';
import { decodeSwapActivityLog, type SwapActivityLogDecoder } from './swapActivityEvent';
import { verifySwapActivity } from './swapActivityVerifier';
import {
  FinalityConfigError,
  assertRequiredConfirmations,
  confirmationsFor,
  createBackendActivityRepository,
  createViemChainReader,
  type TrustedActivityFacts,
  type TrustedChainReader,
  type TrustedSourceReceipt,
} from './activityVerification.server';
import { resolveRequiredConfirmations } from './activityVerificationHandoff.server';
import { findVerifiedSwapPath, VERIFIED_SWAP_V1_ACTION_TYPE } from '../swap/verifiedSwapConfig';
import type { ActivityRepository } from './activityRepository';

export interface TrustedSwapVerificationDeps {
  reader: TrustedChainReader;
  createRepository: (facts: TrustedActivityFacts) => ActivityRepository;
  recoverTypedDataSigner?: (args: { payload: any; signature: Hex }) => Promise<string>;
  decodeLog?: SwapActivityLogDecoder;
  now?: () => number;
}

export async function verifyAndPersistSwapActivity(
  deps: TrustedSwapVerificationDeps,
  handoff: ActivityIntentHandoff,
  options: { requiredConfirmations: number },
): Promise<VerificationOutcome> {
  const required = BigInt(assertRequiredConfirmations(options.requiredConfirmations));
  const chainId = Number(handoff.intent.sourceChainId);

  if (handoff.intent.actionType.toLowerCase() !== VERIFIED_SWAP_V1_ACTION_TYPE.toLowerCase()) {
    return { status: 'REJECTED', reason: 'unsupported activity action type' };
  }

  // Cheap canonical intentHash check BEFORE any RPC or persistence work.
  const computedIntentHash = activityIntentHash(handoff.intent);
  if (computedIntentHash.toLowerCase() !== handoff.intentHash?.toLowerCase()) {
    return { status: 'REJECTED', reason: 'intent hash does not match the signed intent' };
  }

  // Server-owned execution target. Never taken from the request.
  const path = findVerifiedSwapPath(chainId, handoff.intent.token);
  if (!path) return { status: 'REJECTED', reason: 'not an approved verified swap path' };

  let raw: TrustedSourceReceipt | null;
  try {
    raw = await deps.reader.getSourceReceipt({ chainId, txHash: handoff.sourceTxHash });
  } catch (err) {
    return {
      status: 'PENDING',
      reason: err instanceof Error ? err.message : 'source receipt unavailable',
    };
  }
  if (!raw) return { status: 'PENDING', reason: 'no source transaction receipt yet' };

  let confirmations = 0n;
  try {
    const latest = await deps.reader.getLatestBlockNumber({ chainId });
    confirmations = confirmationsFor(latest, raw.blockNumber);
  } catch (err) {
    return {
      status: 'PENDING',
      reason: err instanceof Error ? err.message : 'head block unavailable',
    };
  }
  const finalized = confirmations >= required;

  const receipt: SourceReceipt = {
    status: raw.status,
    blockTimestamp: raw.blockTimestamp,
    logs: raw.logs,
  };

  const facts: TrustedActivityFacts = {
    actionType: VERIFIED_SWAP_V1_ACTION_TYPE,
    token: path.tokenIn,
    destinationChainId: path.chainId,
    occurredAt: raw.blockTimestamp,
  };

  return await verifySwapActivity(
    {
      recoverTypedDataSigner:
        deps.recoverTypedDataSigner ??
        (async ({ payload, signature }) =>
          await recoverTypedDataAddress({ ...(payload as any), signature } as any)),
      getSourceReceipt: async () => receipt,
      getSourceTransaction: async () => {
        if (!deps.reader.getSourceTransaction) {
          throw new Error('trusted chain reader cannot read the source transaction');
        }
        return await deps.reader.getSourceTransaction({
          chainId,
          txHash: handoff.sourceTxHash,
        });
      },
      isFinalized: async () => finalized,
      repository: deps.createRepository(facts),
      decodeLog: deps.decodeLog ?? decodeSwapActivityLog,
      ...(deps.now ? { now: deps.now } : {}),
    },
    handoff,
  );
}

export async function handleSwapActivityVerification(
  handoff: ActivityIntentHandoff,
  overrides?: Partial<TrustedSwapVerificationDeps> & {
    env?: Record<string, string | undefined>;
  },
): Promise<VerificationOutcome> {
  const requiredConfirmations = resolveRequiredConfirmations(
    Number(handoff.intent.sourceChainId),
    overrides?.env,
  );

  return await verifyAndPersistSwapActivity(
    {
      reader: overrides?.reader ?? createViemChainReader(),
      createRepository:
        overrides?.createRepository ?? ((facts) => createBackendActivityRepository(facts)),
      ...(overrides?.recoverTypedDataSigner
        ? { recoverTypedDataSigner: overrides.recoverTypedDataSigner }
        : {}),
      ...(overrides?.decodeLog ? { decodeLog: overrides.decodeLog } : {}),
      ...(overrides?.now ? { now: overrides.now } : {}),
    },
    handoff,
    { requiredConfirmations },
  );
}

export { FinalityConfigError };
