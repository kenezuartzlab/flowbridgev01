/**
 * FlowBridge V17.1B §2 — the single reward-state endpoint every surface reads.
 * Actor-scoped: it only ever resolves the authenticated caller's own state.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/rewards/state")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getAuthUser, jsonResponse, unauthorized } = await import("@/lib/api-auth.server");
        const user = await getAuthUser(request);
        if (!user) return unauthorized();
        try {
          const { resolveRewardStateForUser } = await import("@/lib/rewards/rewardState.server");
          const url = new URL(request.url);
          const chainParam = Number(url.searchParams.get("chainId"));
          const state = await resolveRewardStateForUser({
            userId: user.id,
            emailVerified: user.emailVerified,
            chainId: Number.isFinite(chainParam) && chainParam > 0 ? chainParam : null,
          });
          return jsonResponse({ success: true, rewardState: state });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Failed to resolve reward state" }, 500);
        }
      },
    },
  },
});
