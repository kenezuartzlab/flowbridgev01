/**
 * V15.2 §4 — deterministic policy engine for ActionIntents.
 *
 * Pure: live state is INJECTED, never fetched here, so every decision is
 * reproducible and testable. The rule the whole gate rests on — Flow AI may
 * recommend, this module decides validity, the user's wallet decides execution.
 *
 * If required live state is missing, the outcome is NOT_READY/REJECTED. There is
 * no code path that produces READY_FOR_USER from absent evidence.
 */
import {
  economicFingerprint,
  isExpired,
  validateIntentStructure,
  type ActionIntent,
  type ActionIntentStatus,
} from "./actionIntent";

export interface LiveActionState {
  /** Wallet balance of the input/principal token, in whole units, or null when unread. */
  balance: number | null;
  /** Allowance granted to the canonical contract, whole units, or null when unread. */
  allowance: number | null;
  /** Contract/pause status flags; null when unread. */
  paused: boolean | null;
  /** Minimum stake in whole FLOW (STAKE_FLOW only). */
  minStakeFlow?: number | null;
  /** True when a funded reward schedule is active (staking). */
  scheduleActive?: boolean | null;
  /** Claimable FLOW from the distributor (CLAIM_FLOW). */
  claimableFlow?: number | null;
  /** Distributor/vault reward inventory in whole FLOW. */
  rewardInventoryFlow?: number | null;
  /** Current staked principal, whole FLOW (UNSTAKE/CLAIM_STAKING). */
  stakedFlow?: number | null;
  /** Earned staking rewards, whole FLOW. */
  earnedFlow?: number | null;
  /** Expected output for a swap, whole units of tokenOut; null when unquoted. */
  expectedOut?: number | null;
  /** Bridge route availability (BRIDGE). */
  bridgeRouteSupported?: boolean | null;
  /** Remaining Campaign PTS budget for the org (PARTNER_CAMPAIGN_DRAFT). */
  campaignPtsBudgetRemaining?: number | null;
  /** Fingerprint the live state was read against; mismatch = stale. */
  fingerprint?: string;
  observedAt: string;
}

export type PolicyDecision = "READY" | "NOT_READY" | "REJECTED";

export interface PolicyEvaluation {
  decision: PolicyDecision;
  status: ActionIntentStatus;
  blockers: readonly string[];
  riskFlags: readonly string[];
  /** Domains required but unreadable — disclosed, never estimated over. */
  missingEvidence: readonly string[];
  policyVersion: string;
}

const num = (v: unknown) => Number(v ?? 0);

export function evaluateIntentPolicy(input: {
  intent: ActionIntent;
  live: LiveActionState | null;
  now?: Date;
}): PolicyEvaluation {
  const { intent } = input;
  const now = input.now ?? new Date();
  const blockers: string[] = [];
  const riskFlags: string[] = [];
  const missing: string[] = [];

  if (isExpired(intent, now)) {
    return {
      decision: "REJECTED",
      status: "EXPIRED",
      blockers: ["this plan expired — rebuild it against current state"],
      riskFlags: [],
      missingEvidence: [],
      policyVersion: intent.policyVersion,
    };
  }

  // Re-run structural validation on every evaluation: replaying an old intent
  // must not bypass current registry truth.
  const structure = validateIntentStructure({
    type: intent.type,
    chainId: intent.chainId,
    parameters: intent.parameters,
    actorWallet: intent.actorWallet,
    proposedContract: intent.targetContract,
  });
  if (!structure.ok) {
    return {
      decision: "REJECTED",
      status: "REJECTED",
      blockers: structure.errors,
      riskFlags: ["structural validation failed"],
      missingEvidence: [],
      policyVersion: intent.policyVersion,
    };
  }

  if (intent.type !== "PARTNER_CAMPAIGN_DRAFT" && !intent.actorWallet) {
    blockers.push("bind a wallet before preparing on-chain actions");
  }

  if (!input.live) {
    missing.push("live on-chain and account state");
    return {
      decision: "NOT_READY",
      status: "REJECTED",
      blockers: [...blockers, "required live state could not be read"],
      riskFlags,
      missingEvidence: missing,
      policyVersion: intent.policyVersion,
    };
  }
  const live = input.live;

  if (live.fingerprint && live.fingerprint !== economicFingerprint(intent)) {
    return {
      decision: "REJECTED",
      status: "REJECTED",
      blockers: ["economic parameters changed since this plan was validated"],
      riskFlags: ["stale simulation discarded"],
      missingEvidence: [],
      policyVersion: intent.policyVersion,
    };
  }

  if (live.paused === true) blockers.push("the target contract is paused");
  if (live.paused === null) missing.push("contract pause status");

  const p = intent.parameters as Record<string, any>;

  switch (intent.type) {
    case "SWAP": {
      const amountIn = num(p.amountIn);
      if (live.balance === null) missing.push("your token balance");
      else if (live.balance < amountIn) blockers.push("your balance is lower than the swap amount");
      if (live.allowance === null) missing.push("token allowance");
      else if (live.allowance < amountIn) riskFlags.push("an approval transaction is required first");
      if (live.expectedOut === null || live.expectedOut === undefined) {
        missing.push("a live route quote");
      } else if (live.expectedOut <= 0) {
        blockers.push("no route with liquidity was found for this pair");
      }
      if (num(p.slippageBps) > 100) riskFlags.push("slippage tolerance above 1%");
      break;
    }
    case "BRIDGE": {
      const amountIn = num(p.amountIn);
      if (live.bridgeRouteSupported === false) blockers.push("this bridge route is not supported");
      if (live.bridgeRouteSupported == null) missing.push("bridge route availability");
      if (live.balance === null) missing.push("your token balance");
      else if (live.balance < amountIn) blockers.push("your balance is lower than the bridge amount");
      riskFlags.push("bridge delivery depends on the official bridge, not FlowBridge");
      break;
    }
    case "CLAIM_FLOW": {
      const claimable = live.claimableFlow;
      if (claimable == null) missing.push("your claimable FLOW");
      else if (claimable <= 0) blockers.push("you have no claimable FLOW right now");
      if (live.rewardInventoryFlow == null) missing.push("distributor reward inventory");
      else if (claimable != null && live.rewardInventoryFlow < claimable) {
        blockers.push("the distributor does not hold enough FLOW for this claim");
      }
      break;
    }
    case "STAKE_FLOW": {
      const amountFlow = num(p.amountFlow);
      if (live.scheduleActive === false) blockers.push("no funded reward schedule is active");
      if (live.scheduleActive == null) missing.push("staking schedule state");
      if (live.minStakeFlow == null) missing.push("vault minimum stake");
      else if (amountFlow < live.minStakeFlow) {
        blockers.push(`the vault minimum stake is ${live.minStakeFlow} FLOW`);
      }
      if (live.balance === null) missing.push("your FLOW balance");
      else if (live.balance < amountFlow) blockers.push("your FLOW balance is lower than this stake");
      if (live.allowance === null) missing.push("FLOW allowance for the vault");
      else if (live.allowance < amountFlow) riskFlags.push("an approval transaction is required first");
      break;
    }
    case "UNSTAKE_FLOW": {
      if (live.stakedFlow == null) missing.push("your staked position");
      else if (live.stakedFlow <= 0) blockers.push("you have no staked FLOW to withdraw");
      riskFlags.push("withdrawing principal stops future rewards on that amount");
      break;
    }
    case "CLAIM_STAKING": {
      if (live.earnedFlow == null) missing.push("your earned staking rewards");
      else if (live.earnedFlow <= 0) blockers.push("you have no earned staking rewards yet");
      if (live.rewardInventoryFlow != null && live.earnedFlow != null && live.rewardInventoryFlow < live.earnedFlow) {
        blockers.push("the vault reward inventory is below your earned amount");
      }
      break;
    }
    case "PARTNER_CAMPAIGN_DRAFT": {
      if (!intent.organizationId) blockers.push("no partner organization resolved for your account");
      if (p.rewardType !== "CAMPAIGN_PTS") blockers.push("only Campaign PTS rewards are supported");
      if (live.campaignPtsBudgetRemaining == null) missing.push("your organization's Campaign PTS budget");
      else if (num(p.rewardAmount) * num(p.taskCount) > live.campaignPtsBudgetRemaining) {
        blockers.push("the draft exceeds your organization's remaining Campaign PTS budget");
      }
      riskFlags.push("a /sets reviewer must approve and publish — this stays a draft");
      break;
    }
  }

  if (blockers.length > 0) {
    return {
      decision: "REJECTED",
      status: "REJECTED",
      blockers,
      riskFlags,
      missingEvidence: missing,
      policyVersion: intent.policyVersion,
    };
  }
  if (missing.length > 0) {
    return {
      decision: "NOT_READY",
      status: "REJECTED",
      blockers: [`required state unavailable: ${missing.join("; ")}`],
      riskFlags,
      missingEvidence: missing,
      policyVersion: intent.policyVersion,
    };
  }

  return {
    decision: "READY",
    status: "READY_FOR_USER",
    blockers: [],
    riskFlags,
    missingEvidence: [],
    policyVersion: intent.policyVersion,
  };
}

/**
 * §8 — cross-actor / cross-org preparation denial. Runs before any state read.
 */
export function authorizePreparation(input: {
  actorUserId: string | null;
  actorOrgIds: readonly string[];
  actorWallet: string | null;
  requestedUserId?: string | null;
  requestedWallet?: string | null;
  requestedOrgId?: string | null;
}): { allowed: boolean; reason: string | null } {
  if (!input.actorUserId) {
    return { allowed: false, reason: "Sign in before preparing an action." };
  }
  if (input.requestedUserId && input.requestedUserId !== input.actorUserId) {
    return { allowed: false, reason: "I can only prepare actions for your own account." };
  }
  if (
    input.requestedWallet &&
    input.requestedWallet.toLowerCase() !== (input.actorWallet ?? "").toLowerCase()
  ) {
    return { allowed: false, reason: "I can only prepare actions for your own bound wallet." };
  }
  if (input.requestedOrgId && !input.actorOrgIds.includes(input.requestedOrgId)) {
    return { allowed: false, reason: "You are not a member of that partner organization." };
  }
  return { allowed: true, reason: null };
}
