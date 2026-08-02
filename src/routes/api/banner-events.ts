import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Records banner impressions/clicks for the admin analytics panel.
// Anonymous by design: no wallet, user id, IP or user agent is stored.
const bodySchema = z.object({
  events: z
    .array(
      z.object({
        surface: z.enum(["cabot", "swap", "bridge"]),
        slideId: z.string().trim().min(1).max(64),
        kind: z.enum(["impression", "click"]),
      }),
    )
    .min(1)
    .max(40),
});

export const Route = createFileRoute("/api/banner-events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Invalid payload", { status: 400 });
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
