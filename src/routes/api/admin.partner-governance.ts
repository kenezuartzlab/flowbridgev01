import { createFileRoute } from "@tanstack/react-router";

/**
 * FlowBridge V14 — internal /sets governance API for the partner platform.
 * Gate: existing requireAdmin. Internal Operators get review/moderation only;
 * organization verification and suspension are Super-Admin-only.
 */
export const Route = createFileRoute("/api/admin/partner-governance")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const { requireAdmin } = await import("@/lib/admin/adminGate.server");
        const gate = await requireAdmin(request);
        if (!gate.ok) return gate.response;
        const { listPartnerOrganizations, listGovernanceCampaigns, listAuditEvents } = await import(
          "@/lib/partner/partnerGovernance.server"
        );
        try {
          const [organizations, campaigns, audit] = await Promise.all([
            listPartnerOrganizations(),
            listGovernanceCampaigns(),
            listAuditEvents(),
          ]);
          return jsonResponse({
            success: true,
            role: gate.admin.role,
            organizations,
            campaigns,
            audit,
          });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Failed to load" }, e?.status ?? 500);
        }
      },
      POST: async ({ request }) => {
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const { requireAdmin } = await import("@/lib/admin/adminGate.server");
        const gate = await requireAdmin(request);
        if (!gate.ok) return gate.response;
        const { governanceCampaignAction, governanceOrgAction } = await import(
          "@/lib/partner/partnerGovernance.server"
        );
        try {
          const body = (await request.json()) as {
            target?: string;
            id?: string;
            action?: string;
            note?: string;
          };
          const note = typeof body.note === "string" ? body.note : null;
          if (!body.id) return jsonResponse({ error: "Missing id." }, 400);

          if (body.target === "campaign") {
            const allowed = ["approve", "request_changes", "publish", "pause", "end"] as const;
            if (!allowed.includes(body.action as any)) {
              return jsonResponse({ error: "Unsupported campaign action." }, 400);
            }
            const campaign = await governanceCampaignAction(
              gate.admin,
              body.id,
              body.action as (typeof allowed)[number],
              note,
            );
            return jsonResponse({ success: true, campaign });
          }

          if (body.target === "organization") {
            const allowed = ["verify_org", "reject_org", "suspend_org", "reinstate_org"] as const;
            if (!allowed.includes(body.action as any)) {
              return jsonResponse({ error: "Unsupported organization action." }, 400);
            }
            const org = await governanceOrgAction(
              gate.admin,
              body.id,
              body.action as (typeof allowed)[number],
              note,
            );
            return jsonResponse({ success: true, org });
          }

          return jsonResponse({ error: "Unsupported target." }, 400);
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Action failed" }, e?.status ?? 400);
        }
      },
    },
  },
});
