import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const eventSchema = z.object({
  eventName: z.enum(["quote_success", "quote_failure", "quote_stale", "review_invalidated", "simulation_success", "simulation_failure", "wallet_rejected", "tx_submitted", "tx_confirmed", "tx_reverted", "rpc_failure", "allowance_failure", "insufficient_balance", "minimum_output_failure", "route_unavailable"]),
  network: z.union([z.literal(56), z.literal(97), z.literal(677), z.literal(968)]),
  routeType: z.enum(["single", "atomic_v4", "staged", "unknown"]),
  dex: z.string().min(1).max(80),
  transactionCount: z.number().int().min(0).max(20),
  durationMs: z.number().int().min(0).max(3_600_000).optional(),
  failureReason: z.string().max(80).optional(),
  deviceCategory: z.enum(["mobile", "desktop", "unknown"]),
}).strict();

const bodySchema = z.object({ events: z.array(eventSchema).min(1).max(20) }).strict();

export const Route = createFileRoute("/api/trade-events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response(null, { status: 204 });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("trade_operational_events").insert(parsed.data.events.map((e) => ({
            event_name: e.eventName,
            network: e.network,
            route_type: e.routeType,
            dex: e.dex,
            transaction_count: e.transactionCount,
            duration_ms: e.durationMs ?? null,
            failure_reason: e.failureReason ?? null,
            device_category: e.deviceCategory,
          })));
        } catch { /* telemetry never blocks trading */ }
        return new Response(null, { status: 204 });
      },
    },
  },
});
