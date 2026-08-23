/**
 * FlowBridge V22 §3/§12 — Personalized Decision endpoint.
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
        try {
          const user = await getAuthUser(request);
          const actor = user
            ? { userId: user.id, email: user.email, orgIds: [], isInternalOperator: false }
            : ANONYMOUS_ACTOR;

          const url = new URL(request.url);
          const limit = Math.min(6, Math.max(1, Number(url.searchParams.get("limit") ?? 3) || 3));

          const decision = await resolveDecision({
            actor,
            requestId: crypto.randomUUID(),
            limit,
          });
          return jsonResponse({ success: true, decision });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Failed to build decision" }, 500);
        }
      },
    },
  },
});
