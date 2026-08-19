/**
 * V8.2 — retained, testable verified-swap attribution capture + handoff.
 *
 * Extracted from the swap card so the production client always bundles the
 * capture and `/api/public/activity/verify-swap` handoff implementation, and so
 * the gate, pre-write ordering, fail-closed behaviour and handoff scheduling
 * are covered by unit tests.
 *
 * Semantics are byte-for-byte the V8.1 rules:
 *   - attribution is evidence only: no calldata, no funds, no XP/PTS/FLOW;
 *   - the ONE approved path (BOT Testnet 968 · Router V4 · BDEX V2 routerId 0 ·
 *     USDT -> WBOT) is the only qualifying route;
 *   - the signed amount is the SEMANTIC swap input (no protocol fee added);
 *   - capture/sign/persist (with read-after-write) happens BEFORE the swap
 *     write; when attribution is required, failure aborts before the write.
 */
import { captureActivityIntent, type activityIntentTypedData } from '@/lib/activity/activityIntent';
import { activityIntentHash } from '@/lib/activity/activityCanonicalKey';
import {
  persistSignedAttribution,
  submitSwapActivityVerification,
  type SignedAttribution,
} from '@/lib/activity/activityHandoff';
import { readPublicBuildFlag } from '@/lib/config/publicBuildFlags';
import { findVerifiedSwapPath, VERIFIED_SWAP_V1_ACTION_TYPE, type Hex } from './verifiedSwapConfig';

export type SignTypedDataFn = (
  payload: ReturnType<typeof activityIntentTypedData>,
) => Promise<Hex>;

/** Minimal shape of a quoter step needed to decide route eligibility. */
export interface VerifiedSwapStepLike {
  routerId: number | bigint;
  path: readonly string[];
  inIsNative: boolean;
  outIsNative: boolean;
}

export interface VerifiedSwapAttributionInput {
  chainId?: number | null;
  steps: readonly VerifiedSwapStepLike[];
  /** Semantic swap input amount (calldata swapAmount == SwapActivity.amountIn). */
  amountIn: bigint;
  user: string;
}

export interface VerifiedSwapAttributionDeps {
  signTypedData: SignTypedDataFn;
  enabled?: () => boolean;
  required?: () => boolean;
  persist?: (evidence: SignedAttribution) => boolean;
  capture?: typeof captureActivityIntent;
  newIntentId?: () => Hex;
  nowMs?: () => number;
}

export class VerifiedSwapAttributionError extends Error {}

/** Public build flag gate. Default OFF when no public flag declares it. */
export function isVerifiedSwapAttributionEnabled(): boolean {
  return readPublicBuildFlag('ENABLE_VERIFIED_SWAP_ACTIVITY');
}

/** Fail-closed mode: an enabled qualifying swap must not proceed unattributed. */
export function isVerifiedSwapAttributionRequired(): boolean {
  return readPublicBuildFlag('REQUIRE_ACTIVITY_ATTRIBUTION');
}

function randomIntentId(): Hex {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}${Math.random()}`;
  return `0x${uuid.replace(/[^0-9a-f]/gi, '').padEnd(64, '0').slice(0, 64)}` as Hex;
}

/**
 * True only for the single approved verified-swap route: correct chain, single
 * ERC-20 step, approved routerId and approved token-in -> token-out endpoints.
 */
export function resolveQualifyingVerifiedSwap(input: VerifiedSwapAttributionInput) {
  const chainId = input.chainId;
  const step = input.steps[0];
  if (!chainId || input.steps.length !== 1 || !step) return null;
  if (step.inIsNative || step.outIsNative) return null;
  const tokenIn = step.path[0];
  const tokenOut = step.path[step.path.length - 1];
  if (!tokenIn || !tokenOut) return null;
  const path = findVerifiedSwapPath(chainId, tokenIn);
  if (!path) return null;
  if (BigInt(step.routerId) !== path.routerId) return null;
  if (tokenOut.toLowerCase() !== path.tokenOut.toLowerCase()) return null;
  return path;
}

/**
 * Captures + persists signed attribution BEFORE the swap write.
 * Returns null when the flag is off or the route does not qualify.
 * Throws `VerifiedSwapAttributionError` when attribution is required and
 * signing or persistence fails (caller must abort before approval/write).
 */
export async function captureVerifiedSwapAttribution(
  deps: VerifiedSwapAttributionDeps,
  input: VerifiedSwapAttributionInput,
): Promise<SignedAttribution | null> {
  const enabled = (deps.enabled ?? isVerifiedSwapAttributionEnabled)();
  if (!enabled) return null;

  const path = resolveQualifyingVerifiedSwap(input);
  if (!path) return null;

  const required = (deps.required ?? isVerifiedSwapAttributionRequired)();
  const nowMs = (deps.nowMs ?? (() => Date.now()))();

  const attribution = await (deps.capture ?? captureActivityIntent)(
    { attributionEnabled: true, signTypedData: deps.signTypedData as any },
    {
      intentId: (deps.newIntentId ?? randomIntentId)(),
      user: input.user,
      actionType: VERIFIED_SWAP_V1_ACTION_TYPE,
      sourceChainId: path.chainId,
      destinationChainId: path.chainId,
      token: path.tokenIn,
      amount: input.amountIn,
      recipient: input.user,
      nonce: BigInt(nowMs),
      nowSeconds: Math.floor(nowMs / 1000),
    },
  );

  if (attribution.status !== 'signed') {
    if (required) {
      throw new VerifiedSwapAttributionError(
        'Attribution is required but could not be captured. Swap not sent.',
      );
    }
    return null;
  }

  const evidence: SignedAttribution = {
    intent: attribution.intent,
    signature: attribution.signature,
    intentHash: activityIntentHash(attribution.intent),
  };

  const persisted = (deps.persist ?? persistSignedAttribution)(evidence);
  if (!persisted) {
    if (required) {
      throw new VerifiedSwapAttributionError(
        'Attribution evidence could not be stored. Swap not sent.',
      );
    }
    return null;
  }

  return evidence;
}

/**
 * Fire-and-forget handoff of signed evidence to the existing trusted endpoint.
 * A failed handoff never resends or reverses the swap transaction.
 */
export function scheduleVerifiedSwapHandoff(
  evidence: SignedAttribution | null,
  sourceTxHash: Hex,
  submit: typeof submitSwapActivityVerification = submitSwapActivityVerification,
): void {
  if (!evidence) return;
  void Promise.resolve()
    .then(() => submit(evidence, sourceTxHash))
    .catch(() => {});
}
