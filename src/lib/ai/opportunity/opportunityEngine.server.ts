/**
 * FlowBridge V16 §1 — SERVER-ONLY canonical opportunity resolvers.
 *
 * Every domain resolver reads authoritative state only:
 *   REWARDS   — server FLOW Points ledger / profile payout math
 *   STAKING   — live vault `eth_call` reads (V15.1 evidence loader)
 *   CAMPAIGNS — canonical campaigns/tasks + the wallet's verified completions
 *   WALLET    — persisted account binding
 * A domain that cannot be resolved is reported as DEGRADED and produces no
 * opportunity — it never produces an estimated one.
 */
import type { FlowAiActor } from "../aiTypes";
import { actorScopes } from "../skillRegistry";
import {
  buildCampaignOpportunities,
  buildRewardOpportunities,
  buildStakingOpportunities,
  buildWalletOpportunities,
  filterByActorScope,
  type CanonicalCampaignState,
} from "./opportunityCandidates";
import { rankOpportunities } from "./opportunityRanking";
import type {
  Opportunity,
  OpportunityDomain,
  OpportunityFeed,
  OpportunityViewState,
} from "./opportunityTypes";

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.replace(/,/g, "")) : Number(v);
  return Number.isFinite(n) ? n : null;
};

async function resolveRewards(actor: FlowAiActor, now: Date): Promise<Opportunity[]> {
  if (!actor.userId) return [];
  try {
    const { getUserPointsAndReferrals } = await import("@/lib/flowbridge-db.server");
    const inc: any = await getUserPointsAndReferrals(actor.userId);
    return buildRewardOpportunities(
      {
        claimableFlow: num(inc?.claimableTotal),
        flowPoints: num(inc?.flowPoints),
        flowPointsToday: num(inc?.flowPointsToday),
        dailyCoreSwapCap: num(inc?.dailyCoreSwapCap),
        provenance: "LIVE",
        evidence: [
          {
            id: "db.rewards.ledger",
            label: "Your FLOW Points V2 ledger and claimable payout",
            dataClass: "FLOWBRIDGE_DB",
            authority: "AUTHORITATIVE_STATE",
            freshness: "REALTIME",
            observedAt: now.toISOString(),
            value: {
              flowPoints: num(inc?.flowPoints),
              claimableFlow: num(inc?.claimableTotal),
              claimedFlow: num(inc?.claimedTokens),
              pointsToday: num(inc?.flowPointsToday),
              dailyCoreSwapCap: num(inc?.dailyCoreSwapCap),
            },
            excerpt:
              "Server-computed FLOW payout and today's ledger accrual for your account only.",
          },
        ],
      },
      now,
    );
  } catch {
    throw new Error("REWARDS");
  }
}

async function resolveStaking(actor: FlowAiActor, wallet: string | null, now: Date) {
  const { loadStakingEvidence } = await import("../stakingEvidence.server");
  const { BOT_TESTNET_CHAIN_ID } = await import("@/lib/staking/flowStakingRegistry");
  const evidence = await loadStakingEvidence(wallet);
  if (evidence.length === 0) throw new Error("STAKING");
  const vaultValue = (evidence.find((e) => e.id === "chain.staking.vault")?.value ?? {}) as any;
  const posValue = (evidence.find((e) => e.id === "chain.staking.position")?.value ?? {}) as any;
  return buildStakingOpportunities(
    {
      chainId: num(vaultValue.chainId) ?? BOT_TESTNET_CHAIN_ID,
      vault: typeof vaultValue.vault === "string" ? vaultValue.vault : null,
      paused: typeof vaultValue.paused === "boolean" ? vaultValue.paused : null,
      minStakeFlow: num(vaultValue.minStakeFlow),
      scheduleEnded: typeof vaultValue.scheduleEnded === "boolean" ? vaultValue.scheduleEnded : null,
      stakedFlow: actor.userId && wallet ? num(posValue.stakedFlow) : null,
      earnedFlow: actor.userId && wallet ? num(posValue.earnedFlow) : null,
      provenance: "LIVE",
      evidence,
    },
    now,
  );
}

async function resolveCampaigns(wallet: string | null, now: Date): Promise<Opportunity[]> {
  const { listPublishedCampaigns, getCampaignProgressForWallet } = await import(
    "@/lib/campaign/campaignApi.server"
  );
  const definitions = await listPublishedCampaigns();
  if (definitions.length === 0) return [];
  const progress = wallet
    ? (await getCampaignProgressForWallet(wallet, definitions)).progress
    : [];

  const states: CanonicalCampaignState[] = definitions.map(({ campaign, tasks }) => {
    const mine = progress.find((p) => p.campaignId === campaign.campaignId);
    const totalPoints = tasks.reduce(
      (sum, t) => sum + t.points * Math.max(1, t.completionLimitPerWallet),
      0,
    );
    const earned = mine?.campaignPoints ?? 0;
    const completedTasks = mine ? mine.tasks.filter((t) => t.completed).length : 0;
    return {
      campaignId: campaign.campaignId,
      slug: campaign.slug,
      name: campaign.name,
      endsAt: campaign.endsAt,
      remainingCampaignPoints: Math.max(0, totalPoints - earned),
      completedTasks,
      totalTasks: tasks.length,
      provenance: "LIVE",
      evidence: [
        {
          id: `db.campaign.${campaign.slug}`,
          label: `Canonical campaign "${campaign.name}"`,
          dataClass: "FLOWBRIDGE_DB",
          authority: "AUTHORITATIVE_STATE",
          freshness: "DAILY",
          observedAt: now.toISOString(),
          url: `/campaigns/${campaign.slug}`,
          value: {
            campaignId: campaign.campaignId,
            endsAt: new Date(campaign.endsAt).toISOString(),
            tasks: tasks.length,
            campaignPointsAvailable: Math.max(0, totalPoints - earned),
            campaignPointsEarnedByYou: earned,
          },
          excerpt:
            "Campaign definition, task rules and your verified completions from the canonical campaign tables. Campaign PTS are separate from FLOW Points.",
        },
      ],
    };
  });
  return buildCampaignOpportunities(states, now);
}

async function resolveWallet(actor: FlowAiActor, wallet: string | null, now: Date) {
  const { BOT_TESTNET_CHAIN_ID } = await import("@/lib/staking/flowStakingRegistry");
  return buildWalletOpportunities(
    {
      boundWallet: wallet,
      signedIn: !!actor.userId,
      targetChainId: BOT_TESTNET_CHAIN_ID,
      evidence: [
        {
          id: "db.account.binding",
          label: "Your account wallet binding",
          dataClass: "FLOWBRIDGE_DB",
          authority: "AUTHORITATIVE_STATE",
          freshness: "REALTIME",
          observedAt: now.toISOString(),
          value: { boundWallet: wallet },
          excerpt: "The persisted wallet binding on your own profile row.",
        },
      ],
      provenance: "LIVE",
    },
    now,
  );
}

/**
 * Builds the actor-scoped feed. Retrieval is scoped to the caller BEFORE any
 * read: `wallet` is the wallet on the caller's own profile, never a
 * client-supplied address.
 */
export async function generateOpportunityFeed(input: {
  actor: FlowAiActor;
  states?: readonly OpportunityViewState[];
  limit?: number;
  now?: Date;
}): Promise<OpportunityFeed> {
  const now = input.now ?? new Date();
  const actor = input.actor;

  let wallet: string | null = null;
  if (actor.userId) {
    try {
      const { getProfileWallet } = await import("@/lib/campaign/campaignApi.server");
      wallet = await getProfileWallet(actor.userId);
    } catch {
      wallet = null;
    }
  }

  const degraded: OpportunityDomain[] = [];
  const collected: Opportunity[] = [];

  const domains: readonly [OpportunityDomain, () => Promise<Opportunity[]>][] = [
    ["REWARDS", () => resolveRewards(actor, now)],
    ["STAKING", () => resolveStaking(actor, wallet, now)],
    ["CAMPAIGNS", () => resolveCampaigns(wallet, now)],
    ["WALLET", () => resolveWallet(actor, wallet, now)],
  ];

  const settled = await Promise.all(
    domains.map(async ([domain, run]) => {
      try {
        return { domain, items: await run() };
      } catch {
        return { domain, items: null };
      }
    }),
  );
  for (const result of settled) {
    if (result.items === null) degraded.push(result.domain);
    else collected.push(...result.items);
  }

  const scopes = actorScopes(actor);
  const scoped = filterByActorScope(collected, scopes);
  const items = rankOpportunities({
    items: scoped,
    states: input.states,
    now,
    limit: input.limit ?? 4,
  });

  return {
    generatedAt: now.toISOString(),
    actorScopes: scopes,
    items,
    degradedDomains: degraded,
  };
}
