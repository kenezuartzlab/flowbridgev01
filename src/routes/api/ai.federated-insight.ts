/**
 * FlowBridge V20 — federated insight → canonical reconciliation endpoint.
 *
 * POST /api/ai/federated-insight  { skillId, capabilityKind, inputs }
 *
 * Pipeline: V19 adapter (untrusted, sanitized) → CandidateInsight → server-only
 * canonical reconciliation → at most a CANONICAL V16 opportunity identity.
 *
 * This route can never execute anything and never creates a mission: building a
 * mission stays an explicit user action against /api/missions (V18 §7), which
 * re-resolves the canonical opportunity again by identity.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/ai/federated-insight")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getAuthUser, jsonResponse } = await import("@/lib/api-auth.server");
        const { callCapability } = await import("@/lib/ai/federation/capabilityAdapter.server");
        const { toCandidateInsight } = await import("@/lib/ai/federation/candidateInsight");
        const { reconcileFederatedInsight } = await import(
          "@/lib/ai/federation/insightReconciler.server"
        );

        let body: any;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        const skillId = typeof body?.skillId === "string" ? body.skillId : "";
        const capabilityKind = typeof body?.capabilityKind === "string" ? body.capabilityKind : "";
        if (!skillId || !capabilityKind) {
          return jsonResponse({ error: "skillId and capabilityKind are required" }, 400);
        }

        /** Identity is resolved HERE (§11) — correlation ids cannot select an actor. */
        const user = await getAuthUser(request);
        if (!user) {
          return jsonResponse(
            { error: "Sign in to reconcile external insights against your FlowBridge state." },
            401,
          );
        }

        const requestId = crypto.randomUUID();
        const result = await callCapability({
          skillId,
          capabilityKind,
          inputs: typeof body?.inputs === "object" && body.inputs ? body.inputs : {},
          actor: { userId: user.id },
          requestId,
        });

        if (!result.ok || !result.output || !result.provenance) {
          /** §9 — provider failure degrades external evidence only. */
          return jsonResponse({
            success: false,
            requestId,
            code: result.resultClass,
            status: "DEGRADED",
            notice:
              result.degradedNotice ??
              "BOT Chain skills are unavailable right now — your FlowBridge opportunities are unaffected.",
            executed: false,
            createdActionIntent: false,
            missionsCreated: 0,
          });
        }

        const candidate = toCandidateInsight({
          output: result.output,
          provenance: result.provenance,
        });

        const reconciled = await reconcileFederatedInsight({
          actor: {
            userId: user.id,
            email: user.email,
            orgIds: [],
            isInternalOperator: false,
          },
          candidate,
        });

        return jsonResponse({
          success: true,
          requestId,
          code: result.resultClass,
          latencyMs: result.latencyMs,
          candidate,
          reconciliation: reconciled,
          executed: false,
          createdActionIntent: false,
          missionsCreated: 0,
        });
      },
    },
  },
});
