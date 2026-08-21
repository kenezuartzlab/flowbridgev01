import { createFileRoute } from "@tanstack/react-router";

/**
 * FlowBridge V14 — partner campaign list + draft create.
 * Gate: requirePartner (bearer token + org membership + recorded role).
 */
export const Route = createFileRoute("/api/studio/campaigns")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const { requirePartner } = await import("@/lib/partner/partnerGate.server");
        const gate = await requirePartner(request, { requireOperational: false });
        if (!gate.ok) return gate.response;
        const { listPartnerCampaigns } = await import("@/lib/partner/partnerStudio.server");
        try {
          return jsonResponse({
            success: true,
            org: gate.partner.org,
            role: gate.partner.role,
            campaigns: await listPartnerCampaigns(gate.partner),
          });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Failed to load" }, e?.status ?? 500);
        }
      },
      POST: async ({ request }) => {
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const { requirePartner } = await import("@/lib/partner/partnerGate.server");
        const gate = await requirePartner(request);
        if (!gate.ok) return gate.response;
        const { savePartnerCampaign } = await import("@/lib/partner/partnerStudio.server");
        try {
          const campaign = await savePartnerCampaign(gate.partner, await request.json());
          return jsonResponse({ success: true, campaign });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Failed to save" }, e?.status ?? 400);
        }
      },
    },
  },
});
