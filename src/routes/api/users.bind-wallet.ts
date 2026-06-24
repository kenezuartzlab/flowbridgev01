import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/users/bind-wallet")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getAuthUser, jsonResponse, unauthorized } = await import("@/lib/api-auth.server");
        const { bindUserWallet } = await import("@/lib/flowbridge-db.server");
        const user = await getAuthUser(request);
        if (!user) return unauthorized();
        try {
          const { walletAddress } = (await request.json()) as { walletAddress?: string };
          if (!walletAddress) return jsonResponse({ error: "Missing walletAddress parameter" }, 400);
          const updated = await bindUserWallet(user.id, walletAddress);
          return jsonResponse({ success: true, user: updated });
        } catch (e: any) {
          return jsonResponse({ error: e.message ?? "Failed to bind wallet address" }, 400);
        }
      },
    },
  },
});
