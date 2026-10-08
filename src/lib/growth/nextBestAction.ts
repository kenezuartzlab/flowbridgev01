/**
 * V34 — deterministic next-best-action engine (pure). Evaluated SERVER-SIDE
 * from verified facts; the client only renders the result. Navigation only:
 * nothing here signs, claims, trades or creates a reward.
 */
import type { RewardProgression } from "@/lib/rewards/rewardProgression";

export type NextBestActionId =
  | "EXPLORE" | "CLAIM_FLOW" | "CLAIM_OPENS" | "VERIFY_EMAIL" | "BIND_WALLET" | "CONTINUE_MISSION"
  | "SETTLEMENT_ELIGIBLE" | "MAKE_ELIGIBLE_TRADE" | "VIEW_POSITIONS" | "CHECK_STAKING"
  | "CONTINUE_CAMPAIGN" | "EARN_TOWARD_MINIMUM" | "CONTINUE_EARNING";

export interface NextBestActionFacts {
  signedIn: boolean;
  emailVerified: boolean;
  walletBound: boolean;
  progression: RewardProgression | null;
  activeMissionHref: string | null;
  confirmedMainnetTrades: number;
  eligibleRoutesAvailable: boolean;
  liquidityPositions: number;
  activeStakes: number;
  activeCampaigns: number;
}

export interface NextBestAction {
  id: NextBestActionId;
  label: string;
  reason: string;
  destination: string;
  evidence: string[];
  signsTransaction: false;
}

const act = (id: NextBestActionId, label: string, reason: string, destination: string, evidence: string[]): NextBestAction =>
  ({ id, label, reason, destination, evidence, signsTransaction: false });

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");
const date = (sec: number) => new Date(sec * 1000).toUTCString().replace(/:\d\d GMT$/, " UTC");

export function resolveNextBestAction(f: NextBestActionFacts): NextBestAction {
  if (!f.signedIn)
    return act("EXPLORE", "Explore FlowBridge", "See what you can do on BOT Chain. No account is needed to look around.", "/discover", ["signed_out"]);
  const p = f.progression;
  if (p?.lifecycle === "CLAIMABLE_NOW" && p.allocation)
    return act("CLAIM_FLOW", "Claim FLOW", `${fmt(p.allocation.amountFlow)} FLOW is allocated to your wallet and the claim window is open. You sign the claim yourself.`, "/earn", [`round_${p.allocation.epochId}_open`, "proof_valid", "wallet_match"]);
  if (p?.lifecycle === "ALLOCATED_ON_CHAIN" && p.allocation)
    return act("CLAIM_OPENS", `Claim opens ${date(p.allocation.claimStart)}`, `${fmt(p.allocation.amountFlow)} FLOW is allocated to your wallet in round #${p.allocation.epochId}.`, "/earn", [`round_${p.allocation.epochId}_published`]);
  if (!f.emailVerified)
    return act("VERIFY_EMAIL", "Verify email", "Verifying keeps your profile and reward progress. Trading stays open either way.", "/account", ["email_unverified"]);
  if (!f.walletBound)
    return act("BIND_WALLET", "Bind wallet", "Binding links your verified Mainnet activity to your profile. It is a signature, not a token approval.", "/account", ["wallet_unbound"]);
  if (p?.lifecycle === "ELIGIBLE_FOR_SETTLEMENT")
    return act("SETTLEMENT_ELIGIBLE", "Eligible for next settlement batch", `You have ${fmt(p.availableTowardMinimum)} funded FLOW. A reviewer publishes the next payout round; you will be notified when it is live.`, "/earn", ["available_gte_minimum", "reconciled"]);
  if (f.activeMissionHref)
    return act("CONTINUE_MISSION", "Continue mission", "You have a mission in progress. Pick up where you left off.", f.activeMissionHref, ["active_mission"]);
  if (f.confirmedMainnetTrades === 0 && f.eligibleRoutesAvailable)
    return act("MAKE_ELIGIBLE_TRADE", "Make an eligible trade", "Verified BOT Mainnet swaps of $5 or more through FlowBridge earn FLOW Points. Your wallet always signs.", "/trade", ["no_mainnet_trades", "routes_available"]);
  if (f.liquidityPositions > 0)
    return act("VIEW_POSITIONS", "View positions", "Review your liquidity positions and their current status.", "/liquidity", ["liquidity_positions"]);
  if (f.activeStakes > 0)
    return act("CHECK_STAKING", "Check staking position", "Review your stake, lock and maturity.", "/stake", ["active_stake"]);
  if (f.activeCampaigns > 0)
    return act("CONTINUE_CAMPAIGN", "Continue campaign", "A campaign you can join is active.", "/campaigns", ["active_campaign"]);
  if (p && p.claimedFlow > 0 && p.availableTowardMinimum === 0)
    return act("CONTINUE_EARNING", "Continue earning", `You claimed ${fmt(p.claimedFlow)} FLOW. New eligible activity counts toward your next 1,000 FLOW.`, "/earn", ["claimed"]);
  const remaining = p?.remainingToMinimum ?? 1000;
  return act("EARN_TOWARD_MINIMUM", "Earn toward 1,000 FLOW", `${fmt(remaining)} FLOW remaining to the claim minimum. Eligible swaps and funded referral milestones count.`, "/earn", ["below_minimum"]);
}
