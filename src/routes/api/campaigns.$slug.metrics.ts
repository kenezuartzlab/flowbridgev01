import { createFileRoute } from "@tanstack/react-router";

/**
 * Growth Hub V5 — public, read-only campaign metrics.
 * Published campaigns only. Truncated wallets, aggregate counts and PTS totals.
 * No signatures, intent hashes, private history or raw rows are exposed.
 */
export const Route = createFileRoute("/api/campaigns/$slug/metrics")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const { getPublicCampaignMetrics } = await import(
          "@/lib/campaign/campaignMetrics.server"
        );
        try {
          const metrics = await getPublicCampaignMetrics(params.slug);
          if (!metrics) return jsonResponse({ error: "Campaign not found" }, 404);
          return jsonResponse({ success: true, metrics });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Failed to load metrics" }, 500);
        }
      },
    },
  },
});
