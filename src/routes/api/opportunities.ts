/**
 * FlowBridge V16 §3/§6 — Personal Opportunity Feed endpoint.
 *
 * GET  /api/opportunities        → actor-scoped ranked feed (read-only)
 * POST /api/opportunities        → presentation state only: seen / dismiss / snooze
 *
 * Identity and scopes are resolved HERE. Anonymous callers get PUBLIC
 * opportunities only, and no private read is ever attempted for them.
 */
import { createFileRoute } from "@tanstack/react-router";

const SNOOZE_MS = 24 * 60 * 60 * 1000;

export const Route = createFileRoute("/api/opportunities")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getAuthUser, jsonResponse } = await import("@/lib/api-auth.server");
        const { generateOpportunityFeed } = await import(
          "@/lib/ai/opportunity/opportunityEngine.server"
        );
        const { ANONYMOUS_ACTOR } = await import("@/lib/ai/aiTypes");
        try {
          const user = await getAuthUser(request);
          const actor = user
            ? { userId: user.id, email: user.email, orgIds: [], isInternalOperator: false }
            : ANONYMOUS_ACTOR;

          let states: any[] = [];
          if (user) {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data } = await supabaseAdmin
              .from("ai_opportunity_state")
              .select("opportunity_key,last_seen_at,dismissed_at,snoozed_until")
              .eq("user_id", user.id);
            states = (data ?? []).map((r: any) => ({
              key: r.opportunity_key,
              lastSeenAt: r.last_seen_at,
              dismissedAt: r.dismissed_at,
              snoozedUntil: r.snoozed_until,
            }));
          }

          const url = new URL(request.url);
          const limit = Math.min(8, Math.max(1, Number(url.searchParams.get("limit") ?? 4) || 4));
          const feed = await generateOpportunityFeed({ actor, states, limit });
          return jsonResponse({ success: true, feed });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Failed to build opportunity feed" }, 500);
        }
      },

      POST: async ({ request }) => {
        const { getAuthUser, jsonResponse, unauthorized } = await import("@/lib/api-auth.server");
        const user = await getAuthUser(request);
        if (!user) return unauthorized();
        let body: any;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }
        const key = typeof body?.key === "string" ? body.key.slice(0, 200) : "";
        const action = String(body?.action ?? "");
        if (!key || !["SEEN", "DISMISS", "SNOOZE"].includes(action)) {
          return jsonResponse({ error: "key and action (SEEN|DISMISS|SNOOZE) are required" }, 400);
        }
        const now = new Date();
        const patch: Record<string, string | null> = {
          user_id: user.id,
          opportunity_key: key,
          updated_at: now.toISOString(),
        };
        if (action === "SEEN") patch.last_seen_at = now.toISOString();
        if (action === "DISMISS") patch.dismissed_at = now.toISOString();
        if (action === "SNOOZE")
          patch.snoozed_until = new Date(now.getTime() + SNOOZE_MS).toISOString();

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin
            .from("ai_opportunity_state")
            .upsert(patch, { onConflict: "user_id,opportunity_key" });
          if (error) throw new Error(error.message);
          return jsonResponse({ success: true });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Failed to save state" }, 500);
        }
      },
    },
  },
});
