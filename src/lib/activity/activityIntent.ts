/**
 * Phase A1 — Activity Intent SCAFFOLD ONLY.
 *
 * Builds an EIP-712 typed `FlowBridgeActivityIntent` that a user can sign
 * BEFORE a direct official bridge submission. The signature is attribution
 * evidence only:
 *   - it never authorizes calldata and never moves funds
 *   - it grants ZERO XP / PTS / FLOW (see `rewardsFromSignedIntent`)
 *   - it is never marked completed just because it was signed
 *   - no on-chain ActivityRegistry write happens in this phase (that is A3)
 *
 * If intent capture is unavailable (flag off, no signer, user declines) the
 * caller MUST keep the safe direct bridge flow and mark attribution
 * unavailable — transaction economics never change because of attribution.
 */

export type Hex = `0x${string}`;

export const ACTIVITY_INTENT_TYPES = {
  FlowBridgeActivityIntent: [
    { name: 'intentId', type: 'bytes32' },
    { name: 'user', type: 'address' },
    { name: 'actionType', type: 'bytes32' },
    { name: 'sourceChainId', type: 'uint256' },
    { name: 'destinationChainId', type: 'uint256' },
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'recipient', type: 'address' },
    { name: 'campaignId', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

export const ACTIVITY_INTENT_DOMAIN_NAME = 'FlowBridgeActivity';
export const ACTIVITY_INTENT_DOMAIN_VERSION = '1';
/** Finite validity window for a single-use intent. */
export const ACTIVITY_INTENT_TTL_SECONDS = 15 * 60;

export interface ActivityIntent {
  intentId: Hex;
  user: Hex;
  actionType: Hex;
  sourceChainId: bigint;
  destinationChainId: bigint;
  token: Hex;
  amount: bigint;
  recipient: Hex;
  campaignId: Hex;
  nonce: bigint;
  deadline: bigint;
}

/** Source-chain-specific EIP-712 domain (no verifyingContract in A1). */
export interface ActivityIntentDomain {
  name: string;
  version: string;
  chainId: number;
}

export function activityIntentDomain(sourceChainId: number): ActivityIntentDomain {
  return {
    name: ACTIVITY_INTENT_DOMAIN_NAME,
    version: ACTIVITY_INTENT_DOMAIN_VERSION,
    chainId: sourceChainId,
  };
}

export const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;

export interface BuildActivityIntentArgs {
  intentId: Hex;
  user: string;
  /** bytes32 action tag, e.g. keccak256("DIRECT_BRIDGE") supplied by caller. */
  actionType: Hex;
  sourceChainId: number;
  destinationChainId: number;
  token: string;
  /** amount already encoded in SOURCE token decimals */
  amount: bigint;
  recipient: string;
  campaignId?: Hex;
  /** single-use nonce obtained from the caller (server or random) */
  nonce: bigint;
  /** unix seconds "now" on the source chain or client */
  nowSeconds: number;
  ttlSeconds?: number;
}

export function buildActivityIntent(args: BuildActivityIntentArgs): ActivityIntent {
  if (args.amount <= 0n) throw new Error('Activity intent amount must be positive.');
  const ttl = args.ttlSeconds ?? ACTIVITY_INTENT_TTL_SECONDS;
  if (ttl <= 0) throw new Error('Activity intent needs a finite, positive deadline.');
  return {
    intentId: args.intentId,
    user: args.user as Hex,
    actionType: args.actionType,
    sourceChainId: BigInt(args.sourceChainId),
    destinationChainId: BigInt(args.destinationChainId),
    token: args.token as Hex,
    amount: args.amount,
    recipient: args.recipient as Hex,
    campaignId: args.campaignId ?? ZERO_BYTES32,
    nonce: args.nonce,
    deadline: BigInt(Math.floor(args.nowSeconds) + ttl),
  };
}

/** EIP-712 payload ready for wallet `signTypedData`. */
export function activityIntentTypedData(intent: ActivityIntent) {
  return {
    domain: activityIntentDomain(Number(intent.sourceChainId)),
    types: ACTIVITY_INTENT_TYPES,
    primaryType: 'FlowBridgeActivityIntent' as const,
    message: intent,
  };
}

export type AttributionState =
  | { status: 'signed'; intent: ActivityIntent; signature: Hex; completed: false }
  | { status: 'unavailable'; reason: string };

export interface ActivityIntentDeps {
  /** Wallet typed-data signer. Attribution only. */
  signTypedData: (payload: ReturnType<typeof activityIntentTypedData>) => Promise<Hex>;
  /** Persists/posts the signed intent BEFORE the bridge write. */
  storeSignedIntent?: (args: { intent: ActivityIntent; signature: Hex }) => Promise<void>;
  /** Feature gate; attribution is opt-in and off by default. */
  attributionEnabled: boolean;
}

/**
 * Captures attribution before the direct bridge write. NEVER throws: any
 * failure degrades to `unavailable` so the safe direct bridge flow continues.
 */
export async function captureActivityIntent(
  deps: ActivityIntentDeps,
  args: BuildActivityIntentArgs,
): Promise<AttributionState> {
  if (!deps.attributionEnabled) {
    return { status: 'unavailable', reason: 'attribution disabled' };
  }
  try {
    const intent = buildActivityIntent(args);
    const signature = await deps.signTypedData(activityIntentTypedData(intent));
    await deps.storeSignedIntent?.({ intent, signature });
    // Signed != completed. Completion evidence is added in a later phase.
    return { status: 'signed', intent, signature, completed: false };
  } catch (err) {
    return {
      status: 'unavailable',
      reason: err instanceof Error ? err.message : 'attribution capture failed',
    };
  }
}

/** A signed intent is worth nothing on its own. */
export function rewardsFromSignedIntent(_state: AttributionState): {
  xp: 0;
  pts: 0;
  flow: 0;
} {
  return { xp: 0, pts: 0, flow: 0 };
}

/** Attribution flag: VITE_ENABLE_ACTIVITY_INTENT ("true"/"1"). Default off. */
export function isActivityIntentEnabled(): boolean {
  const raw = import.meta.env.VITE_ENABLE_ACTIVITY_INTENT;
  if (typeof raw !== 'string') return false;
  const v = raw.trim().toLowerCase();
  return v === 'true' || v === '1';
}
