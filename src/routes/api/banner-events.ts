import { createFileRoute } from "@tanstack/react-router";
import { bannerEventsBodySchema } from "@/lib/banners/eventSchema";

// Records banner impressions/clicks for the admin analytics panel.
// Anonymous by design: no wallet, user id, IP or user agent is stored.
export const Route = createFileRoute("/api/banner-events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = bannerEventsBodySchema.safeParse(await request.json().catch(() => null));
        // Analytics must never surface as a user-visible failure (V30 §9):
        // a malformed batch is dropped quietly instead of returning 400.
        if (!parsed.success) return new Response(null, { status: 204 });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("banner_events").insert(
            parsed.data.events.map((e) => ({
              surface: e.surface,
              slide_id: e.slideId,
              kind: e.kind,
            })),
          );
        } catch {
          // Analytics must never break the app surface that emitted them.
        }
        return new Response(null, { status: 204 });
      },
    },
  },
});
