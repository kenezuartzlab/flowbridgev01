/**
 * FlowBridge V23 §2/§7 — Simulation + Scenario Intelligence endpoint.
 *
 * GET /api/ai/scenarios?stakePercent=50&previewStakeFlow=100&snapshotId=<prev>
 *
 * Advisory preview only. Identity, canonical balances, fees, contracts, rewards
 * and chain facts are resolved server-side; the client may only pass bounded
 * planning inputs. This route can never create a Mission, ActionIntent,
 * approval, signature or transaction.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/ai/scenarios")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getAuthUser, jsonResponse } = await import("@/lib/api-auth.server");
        const { resolveScenarioSet } = await import("@/lib/ai/scenario/scenarioService.server");
        const { ANONYMOUS_ACTOR } = await import("@/lib/ai/aiTypes");
        try {
          const user = await getAuthUser(request);
          const actor = user
            ? { userId: user.id, email: user.email, orgIds: [], isInternalOperator: false }
            : ANONYMOUS_ACTOR;

          const url = new URL(request.url);
          const planning: Record<string, unknown> = {};
          for (const [key, value] of url.searchParams.entries()) {
            if (key === "snapshotId") continue;
            planning[key] = value;
          }

          const scenarioSet = await resolveScenarioSet({
            actor,
            requestId: crypto.randomUUID(),
            planning,
            previousSnapshotId: url.searchParams.get("snapshotId"),
          });
          return jsonResponse({ success: true, scenarioSet });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Failed to build scenarios" }, 500);
        }
      },
    },
  },
});
