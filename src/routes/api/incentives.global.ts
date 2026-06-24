import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/incentives/global")({
  server: {
    handlers: {
      GET: async () => {
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const { getGlobalIncentiveStats } = await import("@/lib/flowbridge-db.server");
        try {
          const stats = await getGlobalIncentiveStats();
          return jsonResponse({ success: true, stats });
        } catch (e: any) {
          return jsonResponse({ error: e.message ?? "Failed to load community achievements" }, 500);
        }
      },
    },
  },
});
