/**
 * FlowBridge V18 §2/§5/§7/§8 — SERVER-ONLY Opportunity → Mission compiler.
 *
 * This is the ONLY path that turns a proactive opportunity into an executable
 * V17 Mission plan, and it accepts an opportunity IDENTITY only — never
 * client-authored economics, wallet, chain, template or contract target.
 *
 * Invariants:
 *  - The opportunity is RE-RESOLVED from the canonical V16 engine for the
 *    authenticated actor before anything is compiled (§2/§5). Stale presentation
 *    numbers can never become executable inputs.
 *  - The typed template registry decides the DAG shape (§4/§9). The model cannot
 *    add, remove or reshape steps, and external BOT/agent skills cannot reach
 *    this function at all.
 *  - Compiling authorizes a PLAN only. Every economic step still re-enters the
 *    frozen V15.3 ActionIntent pipeline and is signed by the user's own wallet.
 *  - Deduplication is owned here, not by the client (§7).
 */
import type { FlowAiActor } from "../aiTypes";
import type { Mission } from "../mission/missionTypes";
import {
  MISSION_TEMPLATE_VERSION,
  opportunityKind,
  templateForOpportunity,
  type MissionCompileCode,
  type MissionTemplate,
} from "./missionTemplates";
import type { RankedOpportunity } from "./opportunityTypes";

export type CompileOpportunityResult =
  | {
      ok: true;
      code: Extract<MissionCompileCode, "COMPILED" | "EXISTING_ACTIVE_MISSION">;
      mission: Mission;
      template: MissionTemplate;
      opportunity: RankedOpportunity;
      message: string;
    }
  | {
      ok: false;
      code: Exclude<MissionCompileCode, "COMPILED" | "EXISTING_ACTIVE_MISSION">;
      message: string;
      /** Refreshed explanation, so the surface can explain instead of execute. */
      opportunity?: RankedOpportunity | null;
      message2?: never;
    };

/**
 * §5 — canonical staking availability. It decides plan SHAPE only (whether a
 * stake leg exists); it contributes no amount, rate or balance.
 */
function stakingAvailableFrom(items: readonly RankedOpportunity[], degraded: readonly string[]) {
  if (degraded.includes("STAKING")) return false;
  if (items.some((i) => i.domain === "STAKING" && i.type === "VAULT_PAUSED")) return false;
  return true;
}

export async function compileOpportunityMission(input: {
  actor: FlowAiActor;
  opportunityId: string;
  now?: Date;
}): Promise<CompileOpportunityResult> {
  const now = input.now ?? new Date();
  const actorUserId = input.actor.userId;
  if (!actorUserId) {
    return {
      ok: false,
      code: "NOT_SIGNED_IN",
      message: "Sign in before building a mission from an opportunity.",
    };
  }

  const { generateOpportunityFeed } = await import("./opportunityEngine.server");
  const { createMission } = await import("../mission/missionPlanner");
  const store = await import("../mission/missionStore.server");

  /** §2/§5/§8 — re-resolve for THIS actor. Nothing from the client is trusted. */
  const feed = await generateOpportunityFeed({ actor: input.actor, limit: 8, now });
  const opportunity = feed.items.find((i) => i.id === input.opportunityId) ?? null;

  if (!opportunity) {
    return {
      ok: false,
      code: "NO_LONGER_ACTIONABLE",
      message:
        "That opportunity is no longer actionable from your canonical state, so nothing was compiled. Refresh your insights to see what is current.",
      opportunity: null,
    };
  }

  if (new Date(opportunity.staleAfter).getTime() <= now.getTime()) {
    return {
      ok: false,
      code: "OPPORTUNITY_CHANGED",
      message:
        "This opportunity has changed since it was shown. It was re-resolved instead of compiled, so no stale value became an executable input.",
      opportunity,
    };
  }

  const kind = opportunityKind(opportunity);
  const template = templateForOpportunity({
    domain: opportunity.domain,
    type: opportunity.type,
    stakingAvailable: stakingAvailableFrom(feed.items, feed.degradedDomains),
  });

  if (!template) {
    return {
      ok: false,
      code: "UNSUPPORTED_OPPORTUNITY",
      message:
        "I can explain this opportunity, but it does not map to a supported mission template, so I will not create a free-form economic plan for it.",
      opportunity,
    };
  }

  /** §7 — converge on one active mission per actor + opportunity + template. */
  const existing = await store.findActiveMissionBySource({
    userId: actorUserId,
    opportunityId: opportunity.id,
    templateId: template.id,
  });
  if (existing) {
    return {
      ok: true,
      code: "EXISTING_ACTIVE_MISSION",
      mission: existing,
      template,
      opportunity,
      message: "You already have this mission in progress, so I opened it instead of creating a second one.",
    };
  }

  /**
   * §2 — the typed goal is built from the template and canonical chain
   * constraint. No claimable amount, balance, fee or allowance is copied.
   */
  const chainId =
    typeof opportunity.economicSnapshot.chainId === "number"
      ? (opportunity.economicSnapshot.chainId as number)
      : (await import("@/lib/staking/flowStakingRegistry")).BOT_TESTNET_CHAIN_ID;

  const goal = {
    outcome: template.outcome,
    chainId,
    assetInSymbol: "FLOW",
    assetOutSymbol: null,
    amount: null,
    missingSlots: template.requiresUserInput,
    constraints: {
      maxSpend: null,
      maxSlippageBps: null,
      targetChainId: chainId,
      stakePortionPercent: template.stakePortionPercent,
      neverBridge: false,
      noTokenSpend: false,
    },
    recognized: [
      `compiled from opportunity ${kind.toLowerCase()}`,
      `template ${template.id} ${MISSION_TEMPLATE_VERSION}`,
      `chain ${chainId}`,
      ...(template.stakePortionPercent
        ? [`stake ${template.stakePortionPercent}% of the verified claim`]
        : []),
      ...(template.requiresUserInput.length > 0
        ? [`you supply: ${template.requiresUserInput.join(", ")}`]
        : []),
    ],
  } as const;

  /**
   * §4 — the reward prerequisite is canonical, resolved here, and only decides
   * whether the proven CONVERT_FLOW_POINTS step is inserted.
   */
  let rewardPrerequisite: {
    insertConversion: boolean;
    convertibleFlowPoints?: number | null;
    claimableFlow?: number | null;
  } | null = null;
  if (template.outcome === "CLAIM_ONLY" || template.outcome === "CLAIM_THEN_STAKE") {
    try {
      const { resolveRewardStateForUser } = await import("@/lib/rewards/rewardState.server");
      const rs = await resolveRewardStateForUser({
        userId: actorUserId,
        emailVerified: true,
        chainId,
      });
      rewardPrerequisite = {
        insertConversion: rs.nextEconomicStep === "CONVERT_FLOW_POINTS",
        convertibleFlowPoints: rs.convertibleFlowPoints,
        claimableFlow: rs.claimableFlow,
      };
    } catch {
      rewardPrerequisite = null;
    }
  }

  const mission = createMission({
    id: crypto.randomUUID(),
    actorUserId,
    goalText: template.goalText,
    goal: goal as any,
    linkedOpportunityId: opportunity.id,
    source: {
      opportunityId: opportunity.id,
      opportunityKind: kind,
      templateId: template.id,
      templateVersion: MISSION_TEMPLATE_VERSION,
      compiledAt: now.toISOString(),
    },
    rewardPrerequisite,
    now,
  });

  const saved = await store.saveMission(mission);
  if (!saved.ok) {
    /** §7 — a concurrent compile won the unique index: return that mission. */
    const raced = await store.findActiveMissionBySource({
      userId: actorUserId,
      opportunityId: opportunity.id,
      templateId: template.id,
    });
    if (raced) {
      return {
        ok: true,
        code: "EXISTING_ACTIVE_MISSION",
        mission: raced,
        template,
        opportunity,
        message: "This mission was already being created, so I opened that one.",
      };
    }
    return {
      ok: false,
      code: "COMPILE_FAILED",
      message: saved.error ?? "The mission plan could not be saved.",
      opportunity,
    };
  }

  return {
    ok: true,
    code: "COMPILED",
    mission,
    template,
    opportunity,
    message: template.summary,
  };
}
