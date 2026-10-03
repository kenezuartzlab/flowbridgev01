import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  network: z.union([z.literal(56), z.literal(97), z.literal(677), z.literal(968)]),
  tokenIn: z.string().regex(/^[A-Z0-9.$_-]{1,16}$/),
  tokenOut: z.string().regex(/^[A-Z0-9.$_-]{1,16}$/),
  dexPreference: z.string().min(1).max(24),
  dexesChecked: z.array(z.string().min(1).max(24)).max(6),
  directPoolFound: z.boolean().nullable().optional(),
  multihopFound: z.boolean().nullable().optional(),
  missingConnection: z.string().max(80).nullable().optional(),
  sessionHash: z.string().regex(/^[a-f0-9]{24}$/).optional(),
}).strict();

export const Route = createFileRoute("/api/liquidity-gaps")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response(null, { status: 204 });
        const d = parsed.data;
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("liquidity_gap_observations").insert({
            network: d.network, token_in: d.tokenIn, token_out: d.tokenOut, dex_preference: d.dexPreference,
            dexes_checked: d.dexesChecked, direct_pool_found: d.directPoolFound ?? null,
            multihop_found: d.multihopFound ?? null, missing_connection: d.missingConnection ?? null,
            session_hash: d.sessionHash ?? null,
          });
        } catch { /* analytics never blocks trading */ }
        return new Response(null, { status: 204 });
      },
    },
  },
});
