import { createFileRoute } from "@tanstack/react-router";

/**
 * Growth Hub V5 — admin-gated, READ-ONLY campaign analytics.
 * `?format=csv` returns the same safe aggregate data as a CSV export.
 * This route never writes points, completions, activities or definitions.
 */
export const Route = createFileRoute("/api/campaigns/admin/$id/analytics")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const { requireAdmin } = await import("@/lib/admin/adminGate.server");
        const gate = await requireAdmin(request);
        if (!gate.ok) return gate.response;

        const { getAdminCampaignAnalytics, analyticsToCsv } = await import(
          "@/lib/campaign/campaignMetrics.server"
        );
        try {
          const analytics = await getAdminCampaignAnalytics(params.id);
          if (!analytics) return jsonResponse({ error: "Campaign not found" }, 404);

          if (new URL(request.url).searchParams.get("format") === "csv") {
            return new Response(analyticsToCsv(analytics), {
              headers: {
                "content-type": "text/csv; charset=utf-8",
                "content-disposition": `attachment; filename="campaign-${analytics.slug}-analytics.csv"`,
              },
            });
          }
          return jsonResponse({ success: true, analytics });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Failed to load analytics" }, 500);
        }
      },
    },
  },
});
