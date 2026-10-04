import { createFileRoute } from "@tanstack/react-router";

// Internal reward solvency + reconciliation — admin only, read-only.
export const Route = createFileRoute("/api/admin/rewards-solvency")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireAdmin } = await import("@/lib/admin/adminGate.server");
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const gate = await requireAdmin(request);
        if (!gate.ok) return gate.response;
        try {
          const { buildRewardSolvencyReport } = await import("@/lib/rewards/rewardSolvency.server");
          return jsonResponse(await buildRewardSolvencyReport());
        } catch {
          return jsonResponse({ error: "Reward solvency report is temporarily unavailable." }, 503);
        }
      },
    },
  },
});
