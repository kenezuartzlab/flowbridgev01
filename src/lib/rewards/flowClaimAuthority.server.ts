/**
 * FlowBridge V12 — trusted server claim authority for FLOW token rewards.
 *
 * The browser may only ask "authorize my claim on chain X". Everything
 * authoritative — token, distributor, cumulative entitlement, conversion policy,
 * deadline and the signature — is produced here. The reward signing key is
 * server-only secret material (FLOW_REWARD_SIGNER_PRIVATE_KEY) and is read
 * inside the handler, never exposed to Vite/client code or /sets.
 *
 * Fail-closed: with no approved conversion policy and no deployed distributor,
 * this path returns display data only and never a signature.
 */
import {
  FLOW_CLAIM_BLOCKED_COPY,
  resolveFlowClaimReadiness,
  type FlowClaimBlockedReason,
  type Hex,
} from "./flowRewardsRegistry";
import {
  cumulativeFlowEntitlement,
  getFlowConversionPolicy,
  isFlowConversionPolicyApproved,
} from "./flowConversionPolicy";
import { APPROVED_BOT_TESTNET } from "./flowApprovedTestnetPolicy";
import { buildFlowClaimTypedData } from "./flowClaimTypedData";

/**
 * Signature validity window — owner-approved at 900 seconds for BOT Testnet
 * (V12.2 gate). Short by design; no indefinite authorizations exist.
 */
export const FLOW_CLAIM_DEADLINE_SECONDS = APPROVED_BOT_TESTNET.claim.authorizationLifetimeSeconds;

export interface FlowClaimDisplay {
  /** Off-chain FLOW Points balance (loyalty ledger, not tokens). */
  flowPoints: number;
  /** Claimable off-chain points per the V11 reward rules. */
  claimablePoints: number;
  /** Lifetime points already converted off-chain. */
  lifetimeClaimedPoints: number;
  walletAddress: string | null;
}

export type FlowClaimBlockedExtra =
  | "notAuthenticated"
  | "emailNotVerified"
  | "walletNotBound"
  | "signerNotConfigured"
  | "chainStateUnavailable"
  | "nothingToClaim"
  | "distributorUnderfunded";

export type FlowClaimAuthorization =
  | {
      authorized: false;
      reason: FlowClaimBlockedReason | FlowClaimBlockedExtra;
      message: string;
      chainId: number | null;
      display: FlowClaimDisplay;
      /** Public reconciliation values when they could be read. */
      cumulativeEntitlement?: string;
      alreadyClaimed?: string;
      claimableDelta?: string;
    }
  | {
      authorized: true;
      chainId: number;
      token: Hex;
      distributor: Hex;
      account: Hex;
      cumulativeEntitlement: string;
      alreadyClaimed: string;
      claimableDelta: string;
      distributorBalance: string;
      deadline: number;
      signature: Hex;
      display: FlowClaimDisplay;
    };

export interface AuthorizeArgs {
  /** Authenticated profile id — never taken from the request body. */
  userId: string;
  emailVerified: boolean;
  /** Chain the user wants to claim on; validated against the registry. */
  chainId: number | null;
  /** Injectable for tests. */
  deps?: {
    readIncentives?: (userId: string) => Promise<any>;
    signTypedData?: (typedData: any) => Promise<Hex>;
    now?: () => number;
    conversionPolicyApproved?: boolean;
    readChainState?: (args: {
      chainId: number;
      token: Hex;
      distributor: Hex;
      account: Hex;
    }) => Promise<{ alreadyClaimed: bigint; distributorBalance: bigint }>;
  };
}

function blocked(
  reason: Extract<FlowClaimAuthorization, { authorized: false }>["reason"],
  message: string,
  chainId: number | null,
  display: FlowClaimDisplay,
  extra?: { cumulativeEntitlement?: bigint; alreadyClaimed?: bigint; claimableDelta?: bigint },
): FlowClaimAuthorization {
  return {
    authorized: false,
    reason,
    message,
    chainId,
    display,
    ...(extra?.cumulativeEntitlement != null
      ? { cumulativeEntitlement: extra.cumulativeEntitlement.toString() }
      : {}),
    ...(extra?.alreadyClaimed != null ? { alreadyClaimed: extra.alreadyClaimed.toString() } : {}),
    ...(extra?.claimableDelta != null ? { claimableDelta: extra.claimableDelta.toString() } : {}),
  };
}

const EMPTY_DISPLAY: FlowClaimDisplay = {
  flowPoints: 0,
  claimablePoints: 0,
  lifetimeClaimedPoints: 0,
  walletAddress: null,
};

export async function authorizeFlowTokenClaim(args: AuthorizeArgs): Promise<FlowClaimAuthorization> {
  const readIncentives =
    args.deps?.readIncentives ??
    (async (userId: string) => {
      const { getUserPointsAndReferrals } = await import("@/lib/flowbridge-db.server");
      return getUserPointsAndReferrals(userId);
    });

  const incentives = await readIncentives(args.userId).catch(() => null);
  const display: FlowClaimDisplay = incentives
    ? {
        flowPoints: Number(incentives.flowPoints ?? 0),
        claimablePoints: Number(incentives.claimableTotal ?? 0),
        lifetimeClaimedPoints: Number(incentives.claimedTokens ?? 0),
        walletAddress: (incentives.walletAddress as string | null) ?? null,
      }
    : EMPTY_DISPLAY;

  const chainPolicy = getFlowConversionPolicy(args.chainId);
  const policyApproved = args.deps?.conversionPolicyApproved ?? isFlowConversionPolicyApproved(chainPolicy);
  const readiness = resolveFlowClaimReadiness(args.chainId, policyApproved);
  if (!readiness.ready) {
    return blocked(readiness.reason, FLOW_CLAIM_BLOCKED_COPY[readiness.reason], args.chainId ?? null, display);
  }

  if (!args.emailVerified) {
    return blocked("emailNotVerified", "Verify your email before claiming FLOW.", readiness.config.chainId, display);
  }
  // The claim account is ALWAYS the wallet bound to the authenticated profile.
  const wallet = display.walletAddress;
  if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return blocked("walletNotBound", "Bind your wallet before claiming FLOW.", readiness.config.chainId, display);
  }

  // Campaign PTS are never part of this total — only the off-chain FLOW Points
  // ledger's lifetime claimed amount converts, cumulatively.
  const entitlement = cumulativeFlowEntitlement(display.lifetimeClaimedPoints, chainPolicy);
  if (entitlement == null) {
    return blocked(
      "conversionPolicyNotApproved",
      FLOW_CLAIM_BLOCKED_COPY.conversionPolicyNotApproved,
      readiness.config.chainId,
      display,
    );
  }

  const now = Math.floor((args.deps?.now?.() ?? Date.now()) / 1000);
  const deadline = now + FLOW_CLAIM_DEADLINE_SECONDS;
  const typedData = buildFlowClaimTypedData({
    chainId: readiness.config.chainId,
    distributor: readiness.config.distributor,
    account: wallet.toLowerCase() as Hex,
    cumulativeEntitlement: entitlement,
    deadline: BigInt(deadline),
  });

  const signTypedData = args.deps?.signTypedData ?? defaultSignTypedData;
  let signature: Hex;
  try {
    signature = await signTypedData(typedData);
  } catch {
    return blocked(
      "signerNotConfigured",
      "FLOW claim signing is not configured for this environment.",
      readiness.config.chainId,
      display,
    );
  }

  return {
    authorized: true,
    chainId: readiness.config.chainId,
    token: readiness.config.token,
    distributor: readiness.config.distributor,
    account: wallet.toLowerCase() as Hex,
    cumulativeEntitlement: entitlement.toString(),
    alreadyClaimed: null,
    claimableDelta: null,
    deadline,
    signature,
    display,
  };
}

/**
 * Signs with the server-only reward signer key, but ONLY when that key derives
 * to the owner-approved public reward-signer address. A different key is a
 * configuration error (SIGNER_SECRET_CONFIGURATION_REQUIRED), never a fallback.
 * The key itself is never logged, returned or persisted.
 */
async function defaultSignTypedData(typedData: any): Promise<Hex> {
  const key = process.env["FLOW_REWARD_SIGNER_PRIVATE_KEY"];
  if (!key) throw new Error("SIGNER_SECRET_CONFIGURATION_REQUIRED");
  const { privateKeyToAccount } = await import("viem/accounts");
  const account = privateKeyToAccount(key as Hex);
  if (account.address.toLowerCase() !== APPROVED_BOT_TESTNET.distributor.rewardSigner.toLowerCase()) {
    throw new Error("SIGNER_SECRET_CONFIGURATION_REQUIRED");
  }
  return (await account.signTypedData(typedData)) as Hex;
}
