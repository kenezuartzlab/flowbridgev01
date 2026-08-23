/**
 * FlowBridge V23 §2/§7 — Simulation + Scenario Intelligence endpoint.
 * Hardened by V24 §4/§8/§9/§11.
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
        const { createStageTimer } = await import("@/lib/ai/hardening/budgets");
        const { isLayerEnabled } = await import("@/lib/ai/hardening/killSwitches");
        const { normalizeLegacyStatus, statusNotice } = await import(
          "@/lib/ai/hardening/intelligenceStatus"
        );
        const { buildTelemetry, logIntelligenceTelemetry } = await import(
          "@/lib/ai/hardening/telemetry"
        );

        const requestId = crypto.randomUUID();
        const timer = createStageTimer("SCENARIO");

        /** §11 — layer disabled: honest BLOCKED status, canonical product intact. */
        if (!isLayerEnabled("SCENARIO")) {
          const status = "BLOCKED" as const;
          logIntelligenceTelemetry(
            buildTelemetry({
              surface: "SCENARIO",
              requestId,
              status,
              degradedReasons: ["SCENARIO_LAYER_DISABLED"],
              latencyMs: timer.stages(),
            }),
          );
          return jsonResponse({
            success: true,
            scenarioSet: null,
            intelligenceStatus: status,
            statusNotice: statusNotice(status, "Scenario comparison"),
          });
        }

        try {
          const user = await timer.measure("AUTH", async () => getAuthUser(request));
          const actor = user
            ? { userId: user.id, email: user.email, orgIds: [], isInternalOperator: false }
            : ANONYMOUS_ACTOR;

          const url = new URL(request.url);
          const planning: Record<string, unknown> = {};
          for (const [key, value] of url.searchParams.entries()) {
            if (key === "snapshotId") continue;
            planning[key] = value;
          }

          const scenarioSet = await timer.measure("ENGINE", async () =>
            resolveScenarioSet({
              actor,
              requestId,
              planning,
              previousSnapshotId: url.searchParams.get("snapshotId"),
            }),
          );

          const status = scenarioSet.stale
            ? ("STALE" as const)
            : normalizeLegacyStatus(scenarioSet.status);
          logIntelligenceTelemetry(
            buildTelemetry({
              surface: "SCENARIO",
              requestId,
              userId: actor.userId,
              actorScopes: scenarioSet.actorScopes,
              status,
              degradedReasons: scenarioSet.snapshot.degradedDomains,
              canonicalSnapshotIds: [scenarioSet.snapshot.snapshotId],
              evidenceIds: scenarioSet.snapshot.evidenceRefs.map((e) => e.id),
              selectedTemplateIds: scenarioSet.scenarios.map((s) => s.scenarioKind),
              latencyMs: timer.stages(),
            }),
          );

          return jsonResponse({
            success: true,
            scenarioSet,
            intelligenceStatus: status,
            statusNotice: statusNotice(status, "Scenario comparison"),
            latencyMs: timer.stages(),
          });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Failed to build scenarios", requestId }, 500);
        }
      },
    },
  },
});
