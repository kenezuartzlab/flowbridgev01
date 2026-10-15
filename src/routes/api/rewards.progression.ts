/**
 * V34 — caller-scoped reward progression + next-best-action. Only ever resolves
 * the authenticated caller's own state; never accepts a user id or wallet.
 */
import { createFileRoute } from "@tanstack/react-router";

const progressCache = new Map<string, { at: number; v: any }>();

export const Route = createFileRoute("/api/rewards/progression")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getAuthUser, jsonResponse, unauthorized } = await import("@/lib/api-auth.server");
        const user = await getAuthUser(request);
        if (!user) return unauthorized();
        try {
          const { resolvePersonalProgress } = await import("@/lib/rewards/rewardProgression.server");
          // V36.1: account-scoped (keyed by verified user id) 15s cache with
          // background refresh; ?fresh=1 bypasses (used after wallet binding).
          const fresh = new URL(request.url).searchParams.get("fresh") === "1";
          const key = `${user.id}:${user.emailVerified ? 1 : 0}`;
          const hit = progressCache.get(key);
          const load = () => {
            const p = resolvePersonalProgress({ userId: user.id, emailVerified: user.emailVerified });
            p.then((v) => progressCache.set(key, { at: Date.now(), v }), () => progressCache.delete(key));
            return p;
          };
          if (!fresh && hit && Date.now() - hit.at < 15_000) return jsonResponse({ success: true, cached: true, ...hit.v });
          if (!fresh && hit && Date.now() - hit.at < 120_000) { void load(); return jsonResponse({ success: true, cached: true, ...hit.v }); }
          return jsonResponse({ success: true, ...(await load()) });
        } catch {
          return jsonResponse({ error: "Reward progress is temporarily unavailable." }, 503);
        }
      },
    },
  },
});
