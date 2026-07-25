import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/incentives/global")({
  server: {
    handlers: {
      GET: async () => {
        const { jsonResponse } = await import("@/lib/api-auth.server");
        try {
          const { getGlobalIncentiveStats } = await import("@/lib/flowbridge-db.server");
          const stats = await getGlobalIncentiveStats();
          return jsonResponse({ success: true, stats });
        } catch (e: any) {
          // Public, non-critical stats: never fail the page. Degrade to zeros.
          console.error("[api/incentives/global] falling back to empty stats:", e?.message ?? e);
          return jsonResponse({
            success: true,
            degraded: true,
            stats: {
              globalTotalEarned: 0,
              globalTotalClaimed: 0,
              totalUsers: 0,
              totalTransactions: 0,
              milestoneReached: false,
            },
          });
        }
      },

    },
  },
});
