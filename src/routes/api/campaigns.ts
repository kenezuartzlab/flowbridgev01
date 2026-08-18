import { createFileRoute } from "@tanstack/react-router";

/**
 * B1 Gate 2 — durable campaign read API.
 * Guests: published campaign/task definitions only.
 * Authenticated: progress bound to the wallet on the authenticated profile.
 * Invalid bearer credentials => 401. Read-only: no settlement, no FLOW.
 */
export const Route = createFileRoute("/api/campaigns")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getAuthUser, jsonResponse, unauthorized } = await import("@/lib/api-auth.server");
        const {
          listPublishedCampaigns,
          getProfileWallet,
          getCampaignProgressForWallet,
        } = await import("@/lib/campaign/campaignApi.server");

        const header =
          request.headers.get("authorization") ?? request.headers.get("Authorization");
        const hasBearer = !!header && header.startsWith("Bearer ") && header.slice(7).trim() !== "";
        const user = hasBearer ? await getAuthUser(request) : null;
        if (hasBearer && !user) return unauthorized();

        try {
          const definitions = await listPublishedCampaigns();
          const campaigns = definitions.map(({ campaign, tasks }) => ({
            ...campaign,
            tasks: tasks.map((t) => ({
              taskId: t.taskId,
              title: t.title,
              description: t.description,
              points: t.points,
              requiredCount: t.requiredCount,
              completionLimitPerWallet: t.completionLimitPerWallet,
              sortOrder: t.sortOrder,
              rules: t.rules,
            })),
          }));

          if (!user) {
            return jsonResponse({
              success: true,
              authenticated: false,
              wallet: null,
              campaigns,
              campaignPointsTotal: 0,
              progress: [],
            });
          }

          const wallet = await getProfileWallet(user.id);
          if (!wallet) {
            return jsonResponse({
              success: true,
              authenticated: true,
              wallet: null,
              campaigns,
              campaignPointsTotal: 0,
              progress: [],
            });
          }

          const { progress, campaignPointsTotal } = await getCampaignProgressForWallet(
            wallet,
            definitions,
          );
          return jsonResponse({
            success: true,
            authenticated: true,
            wallet,
            campaigns,
            campaignPointsTotal,
            progress,
          });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Failed to load campaigns" }, 500);
        }
      },
    },
  },
});
