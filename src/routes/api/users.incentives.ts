import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/users/incentives")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getAuthUser, jsonResponse, unauthorized } = await import("@/lib/api-auth.server");
        const { getUserPointsAndReferrals } = await import("@/lib/flowbridge-db.server");
        const user = await getAuthUser(request);
        if (!user) return unauthorized();
        try {
          const incentives = await getUserPointsAndReferrals(user.id);
          return jsonResponse({ success: true, incentives });
        } catch (e: any) {
          return jsonResponse({ error: e.message ?? "Failed to fetch incentives" }, 500);
        }
      },
    },
  },
});
