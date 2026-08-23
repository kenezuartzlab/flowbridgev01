/**
 * FlowBridge V21 — multi-skill deliberation endpoint.
 *
 * POST /api/ai/deliberate  { question, capabilityKinds?, skillIds? }
 *
 * The client may request capability KINDS. `skillIds` is accepted only so the
 * server can prove it refuses them: routing is server-owned (§2). The response
 * is advisory — no calldata, no amount, no target, no ActionIntent, no mission.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/ai/deliberate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getAuthUser, jsonResponse } = await import("@/lib/api-auth.server");
        const { runDeliberation } = await import(
          "@/lib/ai/federation/deliberationRouter.server"
        );
        const { isLayerEnabled } = await import("@/lib/ai/hardening/killSwitches");
        const { normalizeLegacyStatus, statusNotice } = await import(
          "@/lib/ai/hardening/intelligenceStatus"
        );
        const { buildTelemetry, logIntelligenceTelemetry } = await import(
          "@/lib/ai/hardening/telemetry"
        );
        const { createStageTimer } = await import("@/lib/ai/hardening/budgets");

        /** V24 §11 — layer disabled: no external call, canonical product intact. */
        if (!isLayerEnabled("DELIBERATION")) {
          const blockedId = crypto.randomUUID();
          logIntelligenceTelemetry(
            buildTelemetry({
              surface: "DELIBERATION",
              requestId: blockedId,
              status: "BLOCKED",
              degradedReasons: ["DELIBERATION_LAYER_DISABLED"],
            }),
          );
          return jsonResponse({
            success: true,
            requestId: blockedId,
            deliberation: null,
            intelligenceStatus: "BLOCKED",
            statusNotice: statusNotice("BLOCKED", "Multi-source deliberation"),
          });
        }

        let body: any;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        const question = typeof body?.question === "string" ? body.question.trim() : "";
        if (!question) return jsonResponse({ error: "question is required" }, 400);

        /** Identity is resolved HERE (§11) — no client-supplied actor is trusted. */
        const user = await getAuthUser(request);
        if (!user) {
          return jsonResponse(
            { error: "Sign in so FlowBridge can compare external sources against your live state." },
            401,
          );
        }

        const kinds = Array.isArray(body?.capabilityKinds)
          ? body.capabilityKinds.filter((k: unknown) => typeof k === "string")
          : ["GENERAL_ANALYSIS"];
        const clientSkillIds = Array.isArray(body?.skillIds)
          ? body.skillIds.filter((s: unknown) => typeof s === "string")
          : [];

        const requestId = crypto.randomUUID();
        const result = await runDeliberation({
          actor: {
            userId: user.id,
            email: user.email,
            orgIds: [],
            isInternalOperator: false,
          },
          question: question.slice(0, 400),
          requestedCapabilityKinds: kinds,
          clientSkillIds,
          requestId,
        });

        return jsonResponse({ success: true, requestId, deliberation: result });
      },
    },
  },
});
