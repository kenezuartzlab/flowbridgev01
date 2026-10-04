import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/users/claim")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getAuthUser, jsonResponse, unauthorized } = await import("@/lib/api-auth.server");
        const { claimFlowPoints } = await import("@/lib/flowbridge-db.server");
        const user = await getAuthUser(request);
        if (!user) return unauthorized();
        // Mainnet FLOW claims are LOCKED (funding + historical reconciliation gate).
        if (process.env.FLOW_LEGACY_CLAIM_UNLOCKED !== "true") {
          return jsonResponse({ error: "FLOW claims are locked until funding and historical reconciliation are verified.", code: "CLAIMS_LOCKED" }, 403);
        }
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
