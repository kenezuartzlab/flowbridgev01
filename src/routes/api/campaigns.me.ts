import { createFileRoute } from "@tanstack/react-router";

/**
 * Growth Hub V3 — authenticated participant read API.
 * Wallet is resolved from the authenticated profile only. Read-only.
 */
export const Route = createFileRoute("/api/campaigns/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getAuthUser, jsonResponse, unauthorized } = await import(
          "@/lib/api-auth.server"
        );
        const { getProfileWallet } = await import("@/lib/campaign/campaignApi.server");
        const {
          getWalletActivity,
          getWalletCampaignPoints,
          getWalletCompletions,
          getLeaderboard,
        } = await import("@/lib/campaign/participantApi.server");

        const user = await getAuthUser(request);
        if (!user) return unauthorized();

        try {
          const wallet = await getProfileWallet(user.id);
          if (!wallet) {
            return jsonResponse({
              success: true,
              wallet: null,
              campaignPointsTotal: 0,
              completions: [],
              activity: [],
              rank: null,
            });
          }

          const [campaignPointsTotal, completions, activity, leaderboard] =
            await Promise.all([
              getWalletCampaignPoints(wallet),
              getWalletCompletions(wallet),
              getWalletActivity(wallet),
              getLeaderboard(),
            ]);

          return jsonResponse({
            success: true,
            wallet,
            campaignPointsTotal,
            completions,
            activity,
            rank: leaderboard.find((r) => r.wallet === wallet)?.rank ?? null,
          });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Failed to load participant data" }, 500);
        }
      },
    },
  },
});
