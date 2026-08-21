import { createFileRoute } from "@tanstack/react-router";

/**
 * FlowBridge V14 — Partner Studio session: which organizations does the caller
 * belong to, and may they apply for a new one. Never exposes other orgs.
 */
export const Route = createFileRoute("/api/studio/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const { loadStudioSession } = await import("@/lib/partner/partnerOrg.server");
        try {
          const result = await loadStudioSession(request);
          if (!result.ok) return result.response;
          return jsonResponse({ success: true, ...result.session });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Failed to load session" }, e?.status ?? 500);
        }
      },
      POST: async ({ request }) => {
        const { jsonResponse, getAuthUser } = await import("@/lib/api-auth.server");
        const { applyForOrganization } = await import("@/lib/partner/partnerOrg.server");
        const user = await getAuthUser(request);
        if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
        if (!user.emailVerified) {
          return jsonResponse({ error: "Verify your email before applying." }, 403);
        }
        try {
          const org = await applyForOrganization(user.id, await request.json());
          return jsonResponse({ success: true, org });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Application failed" }, e?.status ?? 400);
        }
      },
    },
  },
});
