/**
 * FlowBridge V29 §2 — the single participation endpoint the profile reads.
 * Actor-scoped and read-only: it resolves the authenticated caller's own
 * verified records and writes nothing.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/profile/participation")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getAuthUser, jsonResponse, unauthorized } = await import("@/lib/api-auth.server");
        const user = await getAuthUser(request);
        if (!user) return unauthorized();
        try {
          const { resolveParticipationFactsForUser } = await import(
            "@/lib/identity/participationFacts.server"
          );
          const facts = await resolveParticipationFactsForUser({
            userId: user.id,
            email: user.email,
            emailVerified: user.emailVerified,
          });
          return jsonResponse({ success: true, facts });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Failed to resolve participation" }, 500);
        }
      },
    },
  },
});
