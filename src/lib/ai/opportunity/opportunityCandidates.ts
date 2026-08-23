/**
 * FlowBridge V16 §1/§4 — deterministic candidate construction.
 *
 * PURE module. Every builder takes an already-resolved canonical input and
 * returns Opportunity objects whose numbers come straight from that input. If a
 * required canonical value is missing, the builder returns nothing (or a
 * DEGRADED notice) — it never estimates, and it never invents APY, price, fee,
 * eligibility or campaign reward.
 */
import type { EvidenceItem } from "../aiTypes";
import { opportunityIdentity } from "./opportunityRanking";
import type {
  Opportunity,
  OpportunityDomain,
  OpportunityPreparableAction,
  OpportunityPriority,
  OpportunityProvenance,
  OpportunityReasonCode,
} from "./opportunityTypes";

const STALE_MS = {
  REWARDS: 5 * 60_000,
  STAKING: 3 * 60_000,
  CAMPAIGNS: 10 * 60_000,
  TRADE: 3 * 60_000,
  WALLET: 2 * 60_000,
  ECOSYSTEM: 30 * 60_000,
} as const satisfies Record<OpportunityDomain, number>;

function build(input: {
  domain: OpportunityDomain;
  type: string;
  subject: string;
  actorScope: Opportunity["actorScope"];
  title: string;
  reason: string;
  priority: OpportunityPriority;
  reasonCodes: readonly OpportunityReasonCode[];
  provenance: OpportunityProvenance;
  evidenceRefs: readonly EvidenceItem[];
  economicSnapshot: Record<string, number | string | null>;
  recommendedSurface: { label: string; href: string };
  preparableAction?: OpportunityPreparableAction | null;
  expiresAt?: string | null;
  now: Date;
}): Opportunity {
  const containsPrivateEvidence = input.evidenceRefs.some(
    (e) => e.dataClass === "FLOWBRIDGE_DB" || e.dataClass === "USER_MEMORY",
  );
  return {
    id: opportunityIdentity({ domain: input.domain, type: input.type, subject: input.subject }),
    type: input.type,
    domain: input.domain,
    actorScope: input.actorScope,
    title: input.title,
    reason: input.reason,
    priority: input.priority,
    reasonCodes: input.reasonCodes,
    provenance: input.provenance,
    confidence:
      input.provenance === "LIVE" ? "VERIFIED" : input.provenance === "CACHED" ? "CURRENT" : "STALE",
    createdAt: input.now.toISOString(),
    staleAfter: new Date(input.now.getTime() + STALE_MS[input.domain]).toISOString(),
    expiresAt: input.expiresAt ?? null,
    evidenceRefs: input.evidenceRefs,
    economicSnapshot: Object.freeze({ ...input.economicSnapshot }),
    containsPrivateEvidence,
    recommendedSurface: input.recommendedSurface,
    preparableAction: input.preparableAction ?? null,
  };
}

const flowLabel = (n: number) =>
  n >= 1 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : n.toFixed(4).replace(/0+$/, "");

/* ------------------------------------------------------------------ rewards */

export interface CanonicalRewardsState {
  /** Server ledger / distributor derived FLOW payout available to claim. */
  claimableFlow: number | null;
  flowPoints: number | null;
  flowPointsToday: number | null;
  dailyCoreSwapCap: number | null;
  evidence: readonly EvidenceItem[];
  provenance: OpportunityProvenance;
}

export function buildRewardOpportunities(
  state: CanonicalRewardsState,
  now: Date,
): Opportunity[] {
  const out: Opportunity[] = [];
  if (state.provenance === "DEGRADED") return out;

  if (typeof state.claimableFlow === "number" && state.claimableFlow > 0) {
    out.push(
      build({
        domain: "REWARDS",
        type: "CLAIM_FLOW",
        subject: "distributor",
        actorScope: "AUTHENTICATED_USER",
        title: `${flowLabel(state.claimableFlow)} FLOW ready to claim`,
        reason:
          "Your server ledger balance has an unclaimed FLOW payout. You sign the claim in your own wallet.",
        priority: "HIGH",
        reasonCodes: ["CLAIMABLE_VALUE"],
        provenance: state.provenance,
        evidenceRefs: state.evidence,
        economicSnapshot: {
          claimableFlow: state.claimableFlow,
          flowPoints: state.flowPoints ?? null,
        },
        recommendedSurface: { label: "Open Earn", href: "/earn" },
        now,
      }),
    );
  }

  if (
    typeof state.flowPointsToday === "number" &&
    typeof state.dailyCoreSwapCap === "number" &&
    state.dailyCoreSwapCap > 0 &&
    state.flowPointsToday > 0 &&
    state.flowPointsToday < state.dailyCoreSwapCap
  ) {
    out.push(
      build({
        domain: "REWARDS",
        type: "DAILY_CAP_HEADROOM",
        subject: "core_swap",
        actorScope: "AUTHENTICATED_USER",
        title: `${state.flowPointsToday} / ${state.dailyCoreSwapCap} PTS earned today`,
        reason: "Verified swaps still accrue FLOW Points today — you have daily cap headroom left.",
        priority: "LOW",
        reasonCodes: ["POINTS_ACCRUED", "DAILY_CAP_HEADROOM"],
        provenance: state.provenance,
        evidenceRefs: state.evidence,
        economicSnapshot: {
          pointsToday: state.flowPointsToday,
          dailyCoreSwapCap: state.dailyCoreSwapCap,
        },
        recommendedSurface: { label: "Open Trade", href: "/trade" },
        now,
      }),
    );
  }
  return out;
}

/* ------------------------------------------------------------------ staking */

export interface CanonicalStakingState {
  chainId: number;
  vault: string | null;
  paused: boolean | null;
  minStakeFlow: number | null;
  earnedFlow: number | null;
  stakedFlow: number | null;
  scheduleEnded: boolean | null;
  evidence: readonly EvidenceItem[];
  provenance: OpportunityProvenance;
}

export function buildStakingOpportunities(
  state: CanonicalStakingState,
  now: Date,
): Opportunity[] {
  const out: Opportunity[] = [];
  if (state.provenance === "DEGRADED" || !state.vault) return out;

  if (state.paused) {
    out.push(
      build({
        domain: "STAKING",
        type: "VAULT_PAUSED",
        subject: state.vault,
        actorScope: "PUBLIC",
        title: "FLOW staking is paused",
        reason: "The vault reports paused state on-chain, so new stakes cannot be prepared now.",
        priority: "MEDIUM",
        reasonCodes: ["SOURCE_DEGRADED"],
        provenance: state.provenance,
        evidenceRefs: state.evidence,
        economicSnapshot: { chainId: state.chainId, vault: state.vault },
        recommendedSurface: { label: "Open Stake", href: "/stake" },
        now,
      }),
    );
    return out;
  }

  if (typeof state.earnedFlow === "number" && state.earnedFlow > 0) {
    out.push(
      build({
        domain: "STAKING",
        type: "CLAIM_STAKING_REWARD",
        subject: state.vault,
        actorScope: "AUTHENTICATED_USER",
        title: `${flowLabel(state.earnedFlow)} FLOW staking reward earned`,
        reason: "Your vault position has unclaimed rewards. Claiming is a wallet action you sign.",
        priority: "HIGH",
        reasonCodes: ["STAKE_REWARD_AVAILABLE"],
        provenance: state.provenance,
        evidenceRefs: state.evidence,
        economicSnapshot: {
          earnedFlow: state.earnedFlow,
          stakedFlow: state.stakedFlow ?? null,
          chainId: state.chainId,
        },
        recommendedSurface: { label: "Open Stake", href: "/stake" },
        now,
      }),
    );
  }

  if (
    typeof state.stakedFlow === "number" &&
    state.stakedFlow === 0 &&
    typeof state.minStakeFlow === "number" &&
    state.minStakeFlow > 0
  ) {
    out.push(
      build({
        domain: "STAKING",
        type: "START_STAKING",
        subject: state.vault,
        actorScope: "AUTHENTICATED_USER",
        title: "Stake FLOW to earn rewards",
        reason: `The vault is accepting stakes from ${flowLabel(state.minStakeFlow)} FLOW. Rate is a live testnet estimate, not a guaranteed APY.`,
        priority: "LOW",
        reasonCodes: ["STAKE_AVAILABLE"],
        provenance: state.provenance,
        evidenceRefs: state.evidence,
        economicSnapshot: { minStakeFlow: state.minStakeFlow, chainId: state.chainId },
        recommendedSurface: { label: "Open Stake", href: "/stake" },
        now,
      }),
    );
  }
  return out;
}

/* ---------------------------------------------------------------- campaigns */

export interface CanonicalCampaignState {
  campaignId: string;
  slug: string;
  name: string;
  endsAt: number;
  /** Canonical Campaign PTS still available to this wallet. */
  remainingCampaignPoints: number;
  completedTasks: number;
  totalTasks: number;
  evidence: readonly EvidenceItem[];
  provenance: OpportunityProvenance;
}

export function buildCampaignOpportunities(
  campaigns: readonly CanonicalCampaignState[],
  now: Date,
): Opportunity[] {
  const out: Opportunity[] = [];
  for (const c of campaigns) {
    if (c.provenance === "DEGRADED") continue;
    if (c.endsAt <= now.getTime()) continue;
    if (c.remainingCampaignPoints <= 0 && c.completedTasks >= c.totalTasks) continue;

    const hoursLeft = (c.endsAt - now.getTime()) / 3_600_000;
    const endingSoon = hoursLeft <= 72;
    const inProgress = c.completedTasks > 0;
    const codes: OpportunityReasonCode[] = [
      inProgress ? "CAMPAIGN_IN_PROGRESS" : "CAMPAIGN_ELIGIBLE",
    ];
    if (endingSoon) codes.push("CAMPAIGN_ENDING_SOON");

    out.push(
      build({
        domain: "CAMPAIGNS",
        type: inProgress ? "CAMPAIGN_CONTINUE" : "CAMPAIGN_ELIGIBLE",
        subject: c.campaignId,
        actorScope: "PUBLIC",
        title: endingSoon ? `${c.name} — ending soon` : c.name,
        reason: inProgress
          ? `${c.completedTasks} of ${c.totalTasks} tasks verified. ${c.remainingCampaignPoints} Campaign PTS still available.`
          : `${c.totalTasks} verified task${c.totalTasks === 1 ? "" : "s"} you can attempt for ${c.remainingCampaignPoints} Campaign PTS. Campaign PTS are not FLOW.`,
        priority: endingSoon ? "HIGH" : "MEDIUM",
        reasonCodes: codes,
        provenance: c.provenance,
        evidenceRefs: c.evidence,
        economicSnapshot: {
          campaignPoints: c.remainingCampaignPoints,
          completedTasks: c.completedTasks,
          totalTasks: c.totalTasks,
        },
        recommendedSurface: { label: "Open campaign", href: `/campaigns/${c.slug}` },
        expiresAt: new Date(c.endsAt).toISOString(),
        now,
      }),
    );
  }
  return out;
}

/* ------------------------------------------------------------------- wallet */

export interface CanonicalWalletState {
  boundWallet: string | null;
  signedIn: boolean;
  /** Chain the app currently targets for FlowBridge execution. */
  targetChainId: number;
  /** Live prepared-action state, if the user has one. */
  expiredPreparedIntentId?: string | null;
  evidence: readonly EvidenceItem[];
  provenance: OpportunityProvenance;
}

export function buildWalletOpportunities(
  state: CanonicalWalletState,
  now: Date,
): Opportunity[] {
  const out: Opportunity[] = [];
  if (state.signedIn && !state.boundWallet) {
    out.push(
      build({
        domain: "WALLET",
        type: "BIND_WALLET",
        subject: "account",
        actorScope: "AUTHENTICATED_USER",
        title: "Bind a wallet to start earning",
        reason:
          "No wallet is bound to your account, so verified swaps cannot accrue FLOW Points or claim FLOW.",
        priority: "CRITICAL",
        reasonCodes: ["NO_BOUND_WALLET"],
        provenance: state.provenance,
        evidenceRefs: state.evidence,
        economicSnapshot: { targetChainId: state.targetChainId },
        recommendedSurface: { label: "Open Earn", href: "/earn" },
        now,
      }),
    );
  }
  if (state.expiredPreparedIntentId) {
    out.push(
      build({
        domain: "TRADE",
        type: "PREPARED_ACTION_EXPIRED",
        subject: state.expiredPreparedIntentId,
        actorScope: "AUTHENTICATED_USER",
        title: "Your prepared trade expired",
        reason: "Quotes and fees go stale fast. Rebuild the plan so you sign against live state.",
        priority: "MEDIUM",
        reasonCodes: ["ACTION_EXPIRED"],
        provenance: state.provenance,
        evidenceRefs: state.evidence,
        economicSnapshot: { targetChainId: state.targetChainId },
        recommendedSurface: { label: "Open Trade", href: "/trade" },
        now,
      }),
    );
  }
  return out;
}

/**
 * Actor-scope gate applied BEFORE anything reaches ranking, prompts or the UI.
 * V16 §7: private opportunities may never leave the actor they belong to.
 */
export function filterByActorScope(
  items: readonly Opportunity[],
  scopes: readonly string[],
): Opportunity[] {
  return items.filter((item) => scopes.includes(item.actorScope));
}
