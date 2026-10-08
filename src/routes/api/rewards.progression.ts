/**
 * V34 — caller-scoped reward progression + next-best-action. Only ever resolves
 * the authenticated caller's own state; never accepts a user id or wallet.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/rewards/progression")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getAuthUser, jsonResponse, unauthorized } = await import("@/lib/api-auth.server");
        const user = await getAuthUser(request);
        if (!user) return unauthorized();
        try {
          const { resolvePersonalProgress } = await import("@/lib/rewards/rewardProgression.server");
          return jsonResponse({ success: true, ...(await resolvePersonalProgress({ userId: user.id, emailVerified: user.emailVerified })) });
        } catch {
          return jsonResponse({ error: "Reward progress is temporarily unavailable." }, 503);
        }
      },
    },
  },
});
