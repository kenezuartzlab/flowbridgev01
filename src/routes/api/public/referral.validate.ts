import { createFileRoute } from "@tanstack/react-router";

/** V36.7 — validates a referral code server-side. Returns only a boolean. */
export const Route = createFileRoute("/api/public/referral/validate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const { normalizeReferralCode } = await import("@/lib/flowbridge-db.server");
        const body = (await request.json().catch(() => ({}))) as { code?: string };
        const code = normalizeReferralCode(body.code);
        if (!code) return jsonResponse({ valid: false });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin.from("profiles").select("id").eq("referral_code", code).maybeSingle();
        return jsonResponse({ valid: !!data, code: data ? code : null });
      },
    },
  },
});
