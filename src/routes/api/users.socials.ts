import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/users/socials")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getAuthUser, jsonResponse, unauthorized } = await import("@/lib/api-auth.server");
        const { getSocialFollows, SOCIAL_LINKS } = await import("@/lib/flowbridge-db.server");
        const user = await getAuthUser(request);
        if (!user) return unauthorized();
        try {
          const socials = await getSocialFollows(user.id);
          return jsonResponse({ success: true, socials, links: SOCIAL_LINKS });
        } catch (e: any) {
          return jsonResponse({ error: e.message ?? "Failed to load social follows" }, 500);
        }
      },
      POST: async ({ request }) => {
        const { getAuthUser, jsonResponse, unauthorized } = await import("@/lib/api-auth.server");
        const { confirmSocialFollow } = await import("@/lib/flowbridge-db.server");
        const user = await getAuthUser(request);
        if (!user) return unauthorized();
        try {
          const body = (await request.json()) as { channel?: string };
          const channel = body.channel;
          if (channel !== "youtube" && channel !== "x" && channel !== "telegram") {
            return jsonResponse({ error: "Invalid channel" }, 400);
          }
          const socials = await confirmSocialFollow(user.id, channel);
          return jsonResponse({ success: true, socials });
        } catch (e: any) {
          return jsonResponse({ error: e.message ?? "Failed to record follow" }, 400);
        }
      },
    },
  },
});
