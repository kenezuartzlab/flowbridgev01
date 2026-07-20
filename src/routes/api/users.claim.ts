import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/users/claim")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getAuthUser, jsonResponse, unauthorized } = await import("@/lib/api-auth.server");
        const { claimFlowPoints } = await import("@/lib/flowbridge-db.server");
        const user = await getAuthUser(request);
        if (!user) return unauthorized();
        try {
          const incentives = await claimFlowPoints(user.id, user.emailVerified);
          return jsonResponse({ success: true, incentives });
        } catch (e: any) {
          return jsonResponse({ error: e.message ?? "Failed to process claim" }, 400);
        }
      },
    },
  },
});
