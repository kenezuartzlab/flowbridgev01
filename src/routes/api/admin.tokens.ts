import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const tokenSchema = z.object({
  chain: z.enum(["mainnet", "testnet"]),
  address: z.string().trim().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address"),
  symbol: z.string().trim().min(1).max(16),
  name: z.string().trim().min(1).max(64),
  decimals: z.number().int().min(0).max(36),
  logoUrl: z.string().trim().max(500).url().optional().nullable(),
  routerId: z.number().int().min(0).max(1000).optional().nullable(),
  liquidityVerified: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

export const Route = createFileRoute("/api/admin/tokens")({
  server: {
    handlers: {
      // Full list (including hidden tokens) — admin only.
      GET: async ({ request }) => {
        const { requireAdmin } = await import("@/lib/admin/adminGate.server");
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const gate = await requireAdmin(request);
        if (!gate.ok) return gate.response;
        const { readPublishedTokens } = await import("@/lib/appConfig.server");
        return jsonResponse({ tokens: await readPublishedTokens() });
      },

      // Create or update (upsert on chain+address).
      POST: async ({ request }) => {
        const { requireAdmin } = await import("@/lib/admin/adminGate.server");
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const gate = await requireAdmin(request);
        if (!gate.ok) return gate.response;

        const body = await request.json().catch(() => null);
        const parsed = tokenSchema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse({ error: parsed.error.issues[0]?.message ?? "Invalid token" }, 400);
        }
        const t = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error, data } = await supabaseAdmin
          .from("swap_tokens")
          .upsert(
            {
              chain: t.chain,
              address: t.address.toLowerCase(),
              symbol: t.symbol,
              name: t.name,
              decimals: t.decimals,
              logo_url: t.logoUrl ?? null,
              router_id: t.routerId ?? null,
              liquidity_verified: t.liquidityVerified ?? false,
              is_active: t.isActive ?? true,
              sort_order: t.sortOrder ?? 100,
              created_by: gate.admin.userId,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "chain,address" },
          )
          .select()
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, 500);
        return jsonResponse({ success: true, token: data });
      },

      // Remove a published token.
      DELETE: async ({ request }) => {
        const { requireAdmin } = await import("@/lib/admin/adminGate.server");
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const gate = await requireAdmin(request);
        if (!gate.ok) return gate.response;

        const body = await request.json().catch(() => null);
        const parsed = z
          .object({ id: z.string().uuid() })
          .safeParse(body);
        if (!parsed.success) return jsonResponse({ error: "Invalid token id" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.from("swap_tokens").delete().eq("id", parsed.data.id);
        if (error) return jsonResponse({ error: error.message }, 500);
        return jsonResponse({ success: true });
      },
    },
  },
});
