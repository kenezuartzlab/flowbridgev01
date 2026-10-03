import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PRODUCT_AREAS, PRODUCT_EVENT_NAMES } from "@/lib/ops/productEvents";

const eventSchema = z.object({
  eventName: z.enum(PRODUCT_EVENT_NAMES),
  area: z.enum(PRODUCT_AREAS),
  sessionHash: z.string().regex(/^[a-f0-9]{24}$|^unavailable$/),
  deviceCategory: z.enum(["mobile", "desktop", "unknown"]),
  network: z.union([z.literal(56), z.literal(97), z.literal(677), z.literal(968)]).optional(),
  errorKind: z.string().regex(/^[A-Za-z]{1,40}$/).optional(),
}).strict();
const bodySchema = z.object({ events: z.array(eventSchema).min(1).max(20) }).strict();

export const Route = createFileRoute("/api/product-events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response(null, { status: 204 });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("product_events").insert(parsed.data.events.map((e) => ({
            event_name: e.eventName,
            area: e.area,
            session_hash: e.sessionHash === "unavailable" ? null : e.sessionHash,
            device_category: e.deviceCategory,
            network: e.network ?? null,
            error_kind: e.errorKind ?? null,
          })));
        } catch { /* analytics never blocks the product */ }
        return new Response(null, { status: 204 });
      },
    },
  },
});
