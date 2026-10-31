import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const period = z.object({ label: z.string().trim().min(1).max(80), startsAt: z.string().datetime(), endsAt: z.string().datetime(), botReceived: z.number().positive().max(1_000_000) });

export const Route = createFileRoute("/api/admin/voter-rewards")({
  server: { handlers: {
    GET: async ({ request }) => {
      const { requireAdmin } = await import("@/lib/admin/adminGate.server");
      const { jsonResponse } = await import("@/lib/api-auth.server");
      const gate = await requireAdmin(request);
      if (!gate.ok) return gate.response;
      try {
        const s = await import("@/lib/ecosystem/voterRewards.server");
        await s.reconcileClaims().catch(() => undefined);
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const [st, cfg, periods, claims, wallet] = await Promise.all([
          db.from("vote_indexer_state").select("*").eq("id", 1).maybeSingle(),
          db.from("vote_payout_config").select("*").eq("id", 1).maybeSingle(),
          db.from("vote_reward_periods").select("id,label,starts_at,ends_at,bot_received,flow_per_bot,total_flow,voter_count,created_by_email,created_at").order("created_at", { ascending: false }).limit(20),
          db.from("voter_claims").select("status,flow"),
          s.payoutWalletStatus().catch(() => ({ configured: false as const })),
        ]);
        const sum = (k: string) => (claims.data ?? []).filter((c) => c.status === k).reduce((a, c) => a + Number(c.flow), 0);
        return jsonResponse({ indexer: st.data, config: cfg.data, periods: periods.data ?? [], claims: { confirmed: sum("CONFIRMED"), inFlight: sum("SENT") + sum("RESERVED"), failed: sum("FAILED") }, wallet });
      } catch { return jsonResponse({ error: "Could not load voter rewards." }, 500); }
    },
    POST: async ({ request }) => {
      const { requireAdmin } = await import("@/lib/admin/adminGate.server");
      const { jsonResponse } = await import("@/lib/api-auth.server");
      const gate = await requireAdmin(request);
      if (!gate.ok) return gate.response;
      const body = await request.json().catch(() => ({}));
      try {
        const s = await import("@/lib/ecosystem/voterRewards.server");
        if (body.action === "preview") {
          const p = period.parse(body);
          const r = await s.previewPeriod(p);
          return jsonResponse({ flowPerBot: r.price.flowPerBot, price: r.price, totalFlow: r.totalFlow, voters: r.credits.length, top: r.credits.slice(0, 10) });
        }
        if (body.action === "credit") {
          if (gate.admin.role !== "super_admin") return jsonResponse({ error: "Super admin only." }, 403);
          const p = period.extend({ approvedFlowPerBot: z.number().positive() }).parse(body);
          return jsonResponse(await s.creditPeriod(p, gate.admin.email));
        }
        if (body.action === "config") {
          if (gate.admin.role !== "super_admin") return jsonResponse({ error: "Super admin only." }, 403);
          const c = z.object({ enabled: z.boolean(), minClaimFlow: z.number().min(0), perClaimCapFlow: z.number().positive(), dailyCapFlow: z.number().positive() }).parse(body);
          const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
          const { data: old } = await db.from("vote_payout_config").select("*").eq("id", 1).maybeSingle();
          await db.from("vote_payout_config").update({ enabled: c.enabled, min_claim_flow: c.minClaimFlow, per_claim_cap_flow: c.perClaimCapFlow, daily_cap_flow: c.dailyCapFlow, updated_by_email: gate.admin.email, updated_at: new Date().toISOString() }).eq("id", 1);
          await db.from("admin_audit_events").insert({ actor_user_id: gate.admin.userId, actor_email: gate.admin.email, actor_role: gate.admin.role, object_type: "vote_payout_config", object_id: "1", action: "update", old_value: old as any, new_value: c as any });
          return jsonResponse({ ok: true });
        }
        return jsonResponse({ error: "Unknown action" }, 400);
      } catch (e: any) {
        return jsonResponse({ error: e instanceof z.ZodError ? "Invalid input." : (e?.message ?? "Failed") }, 400);
      }
    },
  } },
});
