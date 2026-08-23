/**
 * FlowBridge V19 — federated capability endpoint.
 *
 * GET  /api/ai/federation            → registry metadata + recent telemetry
 * POST /api/ai/federation            → { skillId, capabilityKind, inputs }
 *
 * The client may only reference an approved, enabled skillId; endpoints are
 * never client-supplied. No response from this route can execute anything:
 * `executed` and `createdActionIntent` are structurally false.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/ai/federation")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const { federationRegistryMetadata } = await import(
          "@/lib/ai/federation/skillFederationRegistry"
        );
        const { recentFederationTelemetry } = await import(
          "@/lib/ai/federation/capabilityAdapter.server"
        );
        void request;
        return jsonResponse({
          success: true,
          registry: federationRegistryMetadata(),
          telemetry: recentFederationTelemetry(10),
        });
      },

      POST: async ({ request }) => {
        const { getAuthUser, jsonResponse } = await import("@/lib/api-auth.server");
        const { callCapability } = await import("@/lib/ai/federation/capabilityAdapter.server");
        const { toCandidateInsight } = await import("@/lib/ai/federation/candidateInsight");

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

        // Identity is resolved HERE — never taken from the request body.
        const user = await getAuthUser(request);
        const requestId = crypto.randomUUID();

        const result = await callCapability({
          skillId,
          capabilityKind,
          inputs: typeof body?.inputs === "object" && body.inputs ? body.inputs : {},
          actor: { userId: user?.id ?? null },
          requestId,
        });

        if (!result.ok || !result.output || !result.provenance) {
          return jsonResponse(
            {
              success: false,
              requestId,
              code: result.resultClass,
              notice: result.degradedNotice,
              executed: false,
              createdActionIntent: false,
            },
            result.resultClass === "UNKNOWN_SKILL" || result.resultClass === "CAPABILITY_NOT_DECLARED"
              ? 400
              : result.resultClass === "RATE_LIMITED"
                ? 429
                : 200,
          );
        }

        const candidate = toCandidateInsight({
          output: result.output,
          provenance: result.provenance,
        });

        return jsonResponse({
          success: true,
          requestId,
          code: result.resultClass,
          latencyMs: result.latencyMs,
          candidate,
          executed: false,
          createdActionIntent: false,
        });
      },
    },
  },
});
