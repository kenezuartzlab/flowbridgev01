import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const eventSchema = z.object({
  eventName: z.enum(["quote_requested", "review_opened", "signature_requested", "quote_success", "quote_failure", "quote_stale", "review_invalidated", "simulation_success", "simulation_failure", "wallet_rejected", "tx_submitted", "tx_confirmed", "tx_reverted", "rpc_failure", "allowance_failure", "insufficient_balance", "minimum_output_failure", "route_unavailable"]),
  network: z.union([z.literal(56), z.literal(97), z.literal(677), z.literal(968)]),
  routeType: z.enum(["single", "atomic_v4", "staged", "unknown"]),
  dex: z.string().min(1).max(80),
  transactionCount: z.number().int().min(0).max(20),
  durationMs: z.number().int().min(0).max(3_600_000).optional(),
  failureReason: z.string().max(80).optional(),
  deviceCategory: z.enum(["mobile", "desktop", "unknown"]),
  tokenIn: z.string().regex(/^[A-Z0-9.$_-]{1,16}$/).optional(),
  tokenOut: z.string().regex(/^[A-Z0-9.$_-]{1,16}$/).optional(),
  priceImpactBps: z.number().int().min(0).max(10_000).optional(),
  slippageBps: z.number().int().min(0).max(5_000).optional(),
  amountOutRatioBps: z.number().int().min(0).max(20_000).optional(),
  poolFeesBps: z.number().int().min(0).max(10_000).optional(),
  flowbridgeFeeBps: z.number().int().min(0).max(1_000).optional(),
  gasEstimate: z.number().int().min(0).max(50_000_000).optional(),
  gasUsed: z.number().int().min(0).max(50_000_000).optional(),
  amountBucket: z.enum(["lt_1", "1_10", "10_100", "100_1k", "gte_1k", "unknown"]).optional(),
  sessionHash: z.string().regex(/^[a-f0-9]{24}$/).optional(),
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
            token_in: e.tokenIn ?? null,
            token_out: e.tokenOut ?? null,
            price_impact_bps: e.priceImpactBps ?? null,
            slippage_bps: e.slippageBps ?? null,
            amount_out_ratio_bps: e.amountOutRatioBps ?? null,
            pool_fees_bps: e.poolFeesBps ?? null,
            flowbridge_fee_bps: e.flowbridgeFeeBps ?? null,
            gas_estimate: e.gasEstimate ?? null,
            gas_used: e.gasUsed ?? null,
            amount_bucket: e.amountBucket ?? null,
            session_hash: e.sessionHash ?? null,
          })));
        } catch { /* telemetry never blocks trading */ }
        return new Response(null, { status: 204 });
      },
    },
  },
});
