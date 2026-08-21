import { createFileRoute } from "@tanstack/react-router";

/**
 * FlowBridge V14 — one partner campaign: read, save, submit/withdraw, delete.
 * Ownership is enforced server-side, so a guessed id from another organization
 * is indistinguishable from a nonexistent one (404).
 */
export const Route = createFileRoute("/api/studio/campaigns/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const { requirePartner } = await import("@/lib/partner/partnerGate.server");
        const gate = await requirePartner(request, { requireOperational: false });
        if (!gate.ok) return gate.response;
        const { getPartnerCampaign } = await import("@/lib/partner/partnerStudio.server");
        try {
          return jsonResponse({ success: true, ...(await getPartnerCampaign(gate.partner, params.id)) });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Failed to load" }, e?.status ?? 500);
        }
      },
      PUT: async ({ request, params }) => {
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const { requirePartner } = await import("@/lib/partner/partnerGate.server");
        const gate = await requirePartner(request);
        if (!gate.ok) return gate.response;
        const { savePartnerCampaign } = await import("@/lib/partner/partnerStudio.server");
        try {
          const campaign = await savePartnerCampaign(gate.partner, await request.json(), {
            campaignId: params.id,
          });
          return jsonResponse({ success: true, campaign });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Failed to save" }, e?.status ?? 400);
        }
      },
      PATCH: async ({ request, params }) => {
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const { requirePartner } = await import("@/lib/partner/partnerGate.server");
        const gate = await requirePartner(request);
        if (!gate.ok) return gate.response;
        const { partnerTransition } = await import("@/lib/partner/partnerStudio.server");
        try {
          const body = (await request.json()) as { action?: string };
          if (body.action !== "submit" && body.action !== "withdraw") {
            return jsonResponse({ error: "Unsupported action." }, 400);
          }
          const campaign = await partnerTransition(gate.partner, params.id, body.action);
          return jsonResponse({ success: true, campaign });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Action failed" }, e?.status ?? 400);
        }
      },
      DELETE: async ({ request, params }) => {
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const { requirePartner } = await import("@/lib/partner/partnerGate.server");
        const gate = await requirePartner(request);
        if (!gate.ok) return gate.response;
        const { deletePartnerDraft } = await import("@/lib/partner/partnerStudio.server");
        try {
          await deletePartnerDraft(gate.partner, params.id);
          return jsonResponse({ success: true });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Delete failed" }, e?.status ?? 400);
        }
      },
    },
  },
});
