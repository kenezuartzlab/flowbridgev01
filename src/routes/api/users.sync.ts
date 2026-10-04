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
          try {
            const { trySettleSignupBonus } = await import("@/lib/rewards/signupBonus.server");
            await trySettleSignupBonus(user.id, user.emailVerified);
          } catch {
            /* diagnostics recorded; retried on next sync */
          }
          return jsonResponse({ success: true, user: profile });
        } catch (e: any) {
          return jsonResponse({ error: e.message ?? "Failed to sync user profile" }, 500);
        }
      },
    },
  },
});
