import { createFileRoute } from "@tanstack/react-router";

/**
 * Growth Hub V3 — public Campaign PTS leaderboard.
 * Authority: campaign_points_ledger (server-aggregated). Read-only.
 * Public rows expose wallet address, PTS total and rank only.
 */
export const Route = createFileRoute("/api/campaigns/leaderboard")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const { getLeaderboard } = await import("@/lib/campaign/participantApi.server");

        const url = new URL(request.url);
        const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") ?? 25)));

        try {
          const rows = await getLeaderboard();
          return jsonResponse({
            success: true,
            total: rows.length,
            rows: rows.slice(0, limit),
          });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Failed to load leaderboard" }, 500);
        }
      },
    },
  },
});
