import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/users/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getAuthUser, jsonResponse, unauthorized } = await import("@/lib/api-auth.server");
        const { ensureProfile, linkReferralIfMissing } = await import("@/lib/flowbridge-db.server");
        const user = await getAuthUser(request);
        if (!user) return unauthorized();
        try {
          const body = (await request.json().catch(() => ({}))) as { referredByCode?: string };
          const profile = await ensureProfile(user.id, user.email, body.referredByCode);
          await linkReferralIfMissing(user.id, body.referredByCode);
          return jsonResponse({ success: true, user: profile });
        } catch (e: any) {
          return jsonResponse({ error: e.message ?? "Failed to sync user profile" }, 500);
        }
      },
    },
  },
});
