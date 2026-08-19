import { createFileRoute } from "@tanstack/react-router";

/**
 * Growth Hub V4 — admin-only per-campaign definition API.
 * PUT    -> replace definition (campaigns + campaign_tasks only)
 * PATCH  -> status change (publish / unpublish / archive) or duplicate
 * DELETE -> fails closed when durable completions exist
 */
export const Route = createFileRoute("/api/campaigns/admin/$id")({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const { requireAdmin } = await import("@/lib/admin/adminGate.server");
        const gate = await requireAdmin(request);
        if (!gate.ok) return gate.response;

        const { saveCampaignDefinition } = await import("@/lib/campaign/campaignAdmin.server");
        try {
          const body = await request.json();
          const campaign = await saveCampaignDefinition(body, { campaignId: params.id });
          return jsonResponse({ success: true, campaign });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Failed to save campaign" }, e?.status ?? 400);
        }
      },
      PATCH: async ({ request, params }) => {
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const { requireAdmin } = await import("@/lib/admin/adminGate.server");
        const gate = await requireAdmin(request);
        if (!gate.ok) return gate.response;

        const { setCampaignStatus, duplicateCampaignDefinition } = await import(
          "@/lib/campaign/campaignAdmin.server"
        );
        try {
          const body = (await request.json().catch(() => ({}))) as any;
          if (body?.action === "duplicate") {
            return jsonResponse({
              success: true,
              campaign: await duplicateCampaignDefinition(params.id),
            });
          }
          const campaign = await setCampaignStatus(params.id, body?.status);
          return jsonResponse({ success: true, campaign });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Failed to update campaign" }, e?.status ?? 400);
        }
      },
      DELETE: async ({ request, params }) => {
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const { requireAdmin } = await import("@/lib/admin/adminGate.server");
        const gate = await requireAdmin(request);
        if (!gate.ok) return gate.response;

        const { deleteCampaignDefinition } = await import("@/lib/campaign/campaignAdmin.server");
        try {
          await deleteCampaignDefinition(params.id);
          return jsonResponse({ success: true });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Failed to delete campaign" }, e?.status ?? 400);
        }
      },
    },
  },
});
