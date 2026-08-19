import { createFileRoute } from "@tanstack/react-router";

/**
 * Growth Hub V4 — admin-only campaign DEFINITION API (list + create/save).
 * Gate: existing requireAdmin (bearer token + app_admins email + bound wallet).
 * Writes only `campaigns` / `campaign_tasks`. Never settles or awards PTS.
 */
export const Route = createFileRoute("/api/campaigns/admin")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const { requireAdmin } = await import("@/lib/admin/adminGate.server");
        const gate = await requireAdmin(request);
        if (!gate.ok) return gate.response;

        const { listAllCampaignDefinitions } = await import(
          "@/lib/campaign/campaignAdmin.server"
        );
        try {
          return jsonResponse({ success: true, campaigns: await listAllCampaignDefinitions() });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Failed to load campaigns" }, e?.status ?? 500);
        }
      },
      POST: async ({ request }) => {
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const { requireAdmin } = await import("@/lib/admin/adminGate.server");
        const gate = await requireAdmin(request);
        if (!gate.ok) return gate.response;

        const { saveCampaignDefinition } = await import("@/lib/campaign/campaignAdmin.server");
        try {
          const body = await request.json();
          const campaign = await saveCampaignDefinition(body);
          return jsonResponse({ success: true, campaign });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Failed to save campaign" }, e?.status ?? 400);
        }
      },
    },
  },
});
