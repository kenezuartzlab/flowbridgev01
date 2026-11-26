import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const createBody = z.object({
  action: z.literal("create"),
  pair: z.enum(["CA/BOT", "CA/USDT", "BOT/USDT", "FLOW/USDT"]),
  budget: z.string().regex(/^\d+(\.\d+)?$/), maxBuyPrice: z.string(), minSellPrice: z.string(), stopPrice: z.string().optional(),
  slippageBps: z.number().int(), maxGasNative: z.string().regex(/^\d+(\.\d+)?$/), maxLoss: z.string().regex(/^\d+(\.\d+)?$/),
  expiresInMinutes: z.number().int().min(1).max(7 * 24 * 60), repeat: z.boolean().default(false),
});
const ctl = z.object({ action: z.enum(["pause", "resume", "cancel", "tick"]), id: z.string().uuid() });

export const Route = createFileRoute("/api/admin/autotrade")({
  server: { handlers: {
    GET: async ({ request }) => {
      const { requireAdmin } = await import("@/lib/admin/adminGate.server");
      const { jsonResponse } = await import("@/lib/api-auth.server");
      const gate = await requireAdmin(request); if (!gate.ok) return gate.response;
      const { db } = await import("@/lib/autotrade/store.server");
      const cfg = await import("@/lib/autotrade/config");
      const { data } = await (await db()).from("autotrade_orders").select("id,pair,mode,state,order_json,last_decision,created_by_email,updated_at").order("created_at", { ascending: false }).limit(50);
      return jsonResponse({ live: cfg.AUTOTRADE_LIVE_ENABLED, public: cfg.AUTOTRADE_PUBLIC_ENABLED, pairs: cfg.AUTOTRADE_PAIRS.map((p) => p.id), excluded: cfg.EXCLUDED_VENUES, orders: data ?? [] });
    },
    POST: async ({ request }) => {
      const { requireAdmin } = await import("@/lib/admin/adminGate.server");
      const { jsonResponse } = await import("@/lib/api-auth.server");
      const gate = await requireAdmin(request); if (!gate.ok) return gate.response;
      if (gate.admin.role !== "super_admin") return jsonResponse({ error: "Super admin only." }, 403);
      const body = await request.json().catch(() => ({}));
      try {
        const E = await import("@/lib/autotrade/engine");
        const C = await import("@/lib/autotrade/config");
        const S = await import("@/lib/autotrade/store.server");
        const { parseUnits } = await import("viem");
        const d = await S.db();
        if (body.action === "create") {
          const b = createBody.parse(body);
          const pair = C.pairById(b.pair)!;
          const now = Date.now();
          const order = E.newOrder(crypto.randomUUID(), {
            pair, mode: "paper", budgetQuote: parseUnits(b.budget, pair.quote.decimals),
            maxBuyPrice: E.parsePrice(b.maxBuyPrice), minSellPrice: E.parsePrice(b.minSellPrice), stopPrice: b.stopPrice ? E.parsePrice(b.stopPrice) : null,
            slippageBps: b.slippageBps, maxGasWeiPerLeg: parseUnits(b.maxGasNative, 18), maxLossQuote: parseUnits(b.maxLoss, pair.quote.decimals),
            expiresAt: now + b.expiresInMinutes * 60_000, repeat: b.repeat,
          }, now);
          const { error } = await d.from("autotrade_orders").insert({ id: order.id, created_by_email: gate.admin.email, pair: pair.id, mode: "paper", state: order.state, order_json: S.serialize(order), version: 0 });
          if (error) throw new Error("Could not save order.");
          await d.from("admin_audit_events").insert({ actor_user_id: gate.admin.userId, actor_email: gate.admin.email, actor_role: gate.admin.role, object_type: "autotrade_order", object_id: order.id, action: "create_paper", old_value: null, new_value: S.serialize(order) });
          return jsonResponse({ ok: true, id: order.id });
        }
        const c = ctl.parse(body);
        const { data: row } = await d.from("autotrade_orders").select("order_json").eq("id", c.id).maybeSingle();
        if (!row) return jsonResponse({ error: "Not found" }, 404);
        const prev = S.deserialize(row.order_json);
        if (c.action === "tick") {
          if (prev.spec.mode !== "paper") return jsonResponse({ error: "LIVE_DISABLED" }, 403);
          const side = prev.state === "HOLDING" ? "sell" : "buy";
          const amt = side === "buy" ? prev.spec.budgetQuote : prev.acquiredBase;
          const { quoteLeg } = await import("@/lib/autotrade/quotes.server");
          const q = await quoteLeg(prev.spec.pair, side, E.splitRouterFee(amt, C.ROUTER_V4_FEE_BPS_BDEX_V3).swapAmount).catch(() => null);
          if (!q) { await d.from("autotrade_orders").update({ last_decision: { kind: "reject", reason: "QUOTE_UNAVAILABLE", at: new Date().toISOString() } }).eq("id", prev.id); return jsonResponse({ decision: { kind: "reject", reason: "QUOTE_UNAVAILABLE" } }); }
          const { order, decision } = E.paperStep(prev, q, Date.now(), C.ROUTER_V4_FEE_BPS_BDEX_V3);
          const dec = JSON.parse(JSON.stringify({ ...decision, quote: q, at: new Date().toISOString() }, (_k, v) => typeof v === "bigint" ? v.toString() : v));
          if (order !== prev) await S.commit(prev, order, gate.admin.email, { type: "paper_tick", decision: dec }, dec);
          else await d.from("autotrade_orders").update({ last_decision: dec, updated_at: new Date().toISOString() }).eq("id", prev.id).eq("version", prev.version);
          return jsonResponse({ decision: dec, state: order.state });
        }
        const next = E.apply(prev, { type: c.action });
        await S.commit(prev, next, gate.admin.email, { type: c.action });
        return jsonResponse({ ok: true, state: next.state });
      } catch (e: any) {
        return jsonResponse({ error: e instanceof z.ZodError ? "Invalid input." : (e?.message ?? "Failed") }, 400);
      }
    },
  } },
});
