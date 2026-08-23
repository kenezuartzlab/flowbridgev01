/**
 * FlowBridge V17 §7 — Mission Orchestrator endpoint.
 *
 * GET  /api/missions            → the signed-in user's missions
 * POST /api/missions            → create | refine | prepare-next | edit-preview
 *                                 | edit | advance | retry | pause | resume | cancel
 *
 * Authority boundary: this endpoint plans, prepares and reads canonical evidence.
 * It never signs, submits, approves, publishes or auto-continues. Every economic
 * step is prepared through the frozen V15.3 ActionIntent pipeline and confirmed
 * only by the user's own wallet.
 */
import { createFileRoute } from "@tanstack/react-router";

async function resolveContext(request: Request) {
  const { getAuthUser } = await import("@/lib/api-auth.server");
  const user = await getAuthUser(request);
  if (!user) return null;
  let wallet: string | null = null;
  let orgIds: string[] = [];
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profile }, { data: orgs }] = await Promise.all([
      supabaseAdmin.from("profiles").select("wallet_address").eq("id", user.id).maybeSingle(),
      supabaseAdmin.from("partner_org_members").select("org_id").eq("user_id", user.id),
    ]);
    const addr = (profile as any)?.wallet_address;
    wallet = typeof addr === "string" && /^0x[a-fA-F0-9]{40}$/.test(addr) ? addr : null;
    orgIds = (orgs ?? []).map((r: any) => String(r.org_id));
  } catch {
    /* degrade: policy blocks on-chain steps without a bound wallet */
  }
  return {
    user,
    wallet,
    actor: { userId: user.id, email: user.email, orgIds, isInternalOperator: false },
  };
}

/**
 * V17.1B §2 — reward truth comes from the ONE canonical resolver. Missions never
 * derive claimability from points arithmetic of their own.
 */
async function canonicalRewardState(userId: string, emailVerified: boolean, chainId?: number) {
  try {
    const { resolveRewardStateForUser } = await import("@/lib/rewards/rewardState.server");
    return await resolveRewardStateForUser({ userId, emailVerified, chainId: chainId ?? null });
  } catch {
    return null;
  }
}


export const Route = createFileRoute("/api/missions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { jsonResponse, unauthorized } = await import("@/lib/api-auth.server");
        const ctx = await resolveContext(request);
        if (!ctx) return unauthorized("Sign in to see your missions.");
        const { listMissions } = await import("@/lib/ai/mission/missionStore.server");
        const missions = await listMissions({ userId: ctx.user.id });
        return jsonResponse({ success: true, missions, executed: false });
      },

      POST: async ({ request }) => {
        const { jsonResponse, unauthorized } = await import("@/lib/api-auth.server");
        const ctx = await resolveContext(request);
        if (!ctx) return unauthorized("Sign in before starting a mission.");

        let body: any = {};
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "Invalid request body." }, 400);
        }

        const { normalizeGoal, mergeGoalTurn } = await import("@/lib/ai/mission/goalNormalizer");
        const planner = await import("@/lib/ai/mission/missionPlanner");
        const progress = await import("@/lib/ai/mission/missionProgress");
        const store = await import("@/lib/ai/mission/missionStore.server");
        const engine = await import("@/lib/ai/mission/missionEngine.server");

        const action = String(body.action ?? "create");

        if (action === "create") {
          const goalText = String(body.goalText ?? "").slice(0, 500);
          const goal = normalizeGoal({ text: goalText });
          if (!goal) {
            return jsonResponse(
              { error: "I couldn't turn that into a mission. Describe the outcome you want." },
              400,
            );
          }
          const mission = planner.createMission({
            id: crypto.randomUUID(),
            actorUserId: ctx.user.id,
            goalText,
            goal,
            linkedOpportunityId: body.opportunityId ? String(body.opportunityId) : null,
          });
          await store.saveMission(mission);
          return jsonResponse({ success: true, mission, executed: false });
        }

        const missionId = String(body.missionId ?? "");
        if (!missionId) return jsonResponse({ error: "A mission id is required." }, 400);
        const loaded = await store.loadMission({ id: missionId, userId: ctx.user.id });
        if (!loaded) return jsonResponse({ error: "Mission not found." }, 404);

        if (action === "refine") {
          const goal = mergeGoalTurn({ goal: loaded.goal, text: String(body.text ?? "") });
          const mission = planner.applyEdit({ mission: loaded, nextGoal: goal });
          await store.saveMission(mission);
          return jsonResponse({ success: true, mission, executed: false });
        }

        if (action === "edit-preview" || action === "edit") {
          const goal = mergeGoalTurn({ goal: loaded.goal, text: String(body.text ?? "") });
          const preview = planner.previewEdit({ mission: loaded, nextGoal: goal });
          if (action === "edit-preview") {
            return jsonResponse({ success: true, preview, goal, executed: false });
          }
          const mission = planner.applyEdit({ mission: loaded, nextGoal: goal });
          await store.saveMission(mission);
          return jsonResponse({ success: true, mission, preview, executed: false });
        }

        if (action === "prepare-next") {
          const claimableFlow = await canonicalClaimable(ctx.user.id);
          const result = await engine.prepareNextMissionStep({
            mission: loaded,
            actor: ctx.actor as any,
            wallet: ctx.wallet,
            claimableFlow,
          });
          await store.saveMission(result.mission);
          return jsonResponse({
            success: true,
            mission: result.mission,
            step: result.step,
            prepared: result.prepared,
            failureClass: result.failureClass,
            recovery: result.failureClass ? progress.recoveryAdvice(result.failureClass) : null,
            message: result.message,
            executed: false,
          });
        }

        if (action === "advance") {
          const result = await engine.advanceMissionStep({
            mission: loaded,
            stepId: String(body.stepId ?? loaded.currentStepId ?? ""),
            txHash: body.txHash ? String(body.txHash) : null,
            userId: ctx.user.id,
            wallet: ctx.wallet,
          });
          if (result.advanced) await store.saveMission(result.mission);
          return jsonResponse({
            success: true,
            mission: result.mission,
            advanced: result.advanced,
            message: result.message,
            executed: false,
          });
        }

        if (action === "submitted") {
          const mutated = progress.markStepSubmitted({
            mission: loaded,
            stepId: String(body.stepId ?? ""),
            txHash: String(body.txHash ?? ""),
          });
          if (!mutated.ok) return jsonResponse({ error: mutated.error }, 400);
          await store.saveMission(mutated.mission);
          return jsonResponse({ success: true, mission: mutated.mission, executed: false });
        }

        if (action === "retry") {
          const mutated = progress.retryStep({ mission: loaded, stepId: String(body.stepId ?? "") });
          if (!mutated.ok) return jsonResponse({ error: mutated.error }, 400);
          await store.saveMission(mutated.mission);
          return jsonResponse({ success: true, mission: mutated.mission, executed: false });
        }

        if (action === "pause" || action === "resume" || action === "cancel") {
          const mission =
            action === "pause"
              ? progress.pauseMission(loaded)
              : action === "resume"
                ? progress.resumeMission(loaded)
                : progress.cancelMission(loaded);
          await store.saveMission(mission);
          return jsonResponse({ success: true, mission, executed: false });
        }

        return jsonResponse({ error: "Unsupported mission action." }, 400);
      },
    },
  },
});
