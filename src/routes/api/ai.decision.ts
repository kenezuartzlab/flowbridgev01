/**
 * FlowBridge V22 §3/§12 — Personalized Decision endpoint.
 * Hardened by V24 §4/§8/§9/§11: shared typed status, per-layer kill switch,
 * stage latency budget and redacted structured telemetry.
 *
 * GET /api/ai/decision?limit=3
 *
 * Read-only. Identity, ranking weights and explanation facts are resolved on
 * the server; the client may only ask for a bounded item count. This route can
 * never execute anything, never creates an ActionIntent and never creates a
 * mission — building a mission stays an explicit call to /api/missions.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/ai/decision")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getAuthUser, jsonResponse } = await import("@/lib/api-auth.server");
        const { resolveDecision } = await import("@/lib/ai/decision/decisionService.server");
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
        const timer = createStageTimer("DECISION");
        try {
          const user = await timer.measure("AUTH", async () => getAuthUser(request));
          const actor = user
            ? { userId: user.id, email: user.email, orgIds: [], isInternalOperator: false }
            : ANONYMOUS_ACTOR;

          const url = new URL(request.url);
          const limit = Math.min(6, Math.max(1, Number(url.searchParams.get("limit") ?? 3) || 3));

          const decision = await timer.measure("ENGINE", async () =>
            resolveDecision({
              actor,
              requestId,
              limit,
              /** §11 — personalization can be disabled without losing canonical order. */
              personalizationEnabled: isLayerEnabled("PERSONALIZATION"),
            }),
          );

          const status = normalizeLegacyStatus(decision.status);
          logIntelligenceTelemetry(
            buildTelemetry({
              surface: "DECISION",
              requestId,
              userId: actor.userId,
              actorScopes: decision.actorScopes,
              status,
              degradedReasons: decision.degradedDomains,
              evidenceIds: decision.items.flatMap((i) => i.evidenceRefs.map((e) => e.id)),
              selectedTemplateIds: decision.items.map((i) => i.id),
              latencyMs: timer.stages(),
            }),
          );

          return jsonResponse({
            success: true,
            decision,
            intelligenceStatus: status,
            statusNotice: decision.notice ?? statusNotice(status, "Personalized ranking"),
            latencyMs: timer.stages(),
          });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Failed to build decision", requestId }, 500);
        }
      },
    },
  },
});
