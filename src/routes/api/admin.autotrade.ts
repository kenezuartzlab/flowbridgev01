import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const createBody = z.object({
  action: z.literal("create"),
  pair: z.enum(["CA/BOT", "CA/USDT", "BOT/USDT", "FLOW/USDT"]),
  budget: z.string().regex(/^\d+(\.\d+)?$/), maxBuyPrice: z.string(), minSellPrice: z.string(), stopPrice: z.string().optional(),
  slippageBps: z.number().int(), maxGasNative: z.string().regex(/^\d+(\.\d+)?$/), maxLoss: z.string().regex(/^\d+(\.\d+)?$/),
  expiresInMinutes: z.number().int().min(1).max(7 * 24 * 60), repeat: z.literal(false).default(false),
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
      const R = await import("@/lib/autotrade/registry");
      const { createPublicClient, http, parseAbi } = await import("viem");
      const pc = createPublicClient({ transport: http("https://rpc.botchain.ai", { timeout: 6_000 }) });
      const a = parseAbi(["function owner() view returns (address)", "function paused() view returns (bool)", "function routerCount() view returns (uint256)", "function routers(uint256) view returns (address,uint8,address,bool,string,string)", "function globalFeeBps() view returns (uint256)"]);
      const registry = await (async () => {
        const [owner, paused, count, globalFeeBps] = await Promise.all([pc.readContract({ address: cfg.ROUTER_V4, abi: a, functionName: "owner" }), pc.readContract({ address: cfg.ROUTER_V4, abi: a, functionName: "paused" }), pc.readContract({ address: cfg.ROUTER_V4, abi: a, functionName: "routerCount" }), pc.readContract({ address: cfg.ROUTER_V4, abi: a, functionName: "globalFeeBps" })]);
        const routers = await Promise.all(Array.from({ length: Math.min(Number(count), 6) }, (_, i) => pc.readContract({ address: cfg.ROUTER_V4, abi: a, functionName: "routers", args: [BigInt(i)] }).then((r) => ({ id: i, router: r[0], type: r[1] === 0 ? "V2" : "V3", wrappedNative: r[2], active: r[3], name: r[4] }))));
        return { owner, paused, globalFeeBps: Number(globalFeeBps), routers };
      })().catch(() => null);
      const dd = await db();
      const [{ data: lease }, { data: metrics }, { data: control }] = await Promise.all([
        dd.from("autotrade_worker_lease").select("heartbeat_at,lease_until,last_block,fencing").eq("name", "autotrade-main").maybeSingle(),
        dd.from("autotrade_worker_metrics").select("latency_ms,consensus,decided_at").order("decided_at", { ascending: false }).limit(200),
        dd.from("autotrade_control").select("emergency_paused,updated_at").eq("id", true).maybeSingle()]);
      const { percentile } = await import("@/lib/autotrade/worker");
      const l = (metrics ?? []).map((m) => m.latency_ms ?? 0);
      const worker = { lease, samples: l.length, p50: percentile(l, 50), p95: percentile(l, 95), lastConsensus: metrics?.[0]?.consensus ?? null, lastAt: metrics?.[0]?.decided_at ?? null };
      return jsonResponse({ registry, candidates: R.VENUE_CANDIDATES, registryWrites: R.REGISTRY_WRITES_ENABLED, worker, control, live: cfg.AUTOTRADE_LIVE_ENABLED, public: cfg.AUTOTRADE_PUBLIC_ENABLED, pairs: cfg.AUTOTRADE_PAIRS.map((p) => p.id), excluded: cfg.EXCLUDED_VENUES, orders: data ?? [] });
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
        if (body.action === "prepare_canary") {
          const parameters = z.object({
            maxBuyPrice: z.string().max(64).default(""), minSellPrice: z.string().max(64).default(""),
            slippageBps: z.number().int().min(1).max(C.GUARDS.maxSlippageBps).default(50),
            expiresInMinutes: z.number().int().min(1).max(7 * 24 * 60).default(60),
          }).parse(body);
          const { readCanaryPreparation } = await import("@/lib/autotrade/preparation.server");
          try { return jsonResponse({ preparation: await readCanaryPreparation(parameters) }); }
          catch { return jsonResponse({ error: "Canary estimate unavailable; no order was created. Retry with fresh verified chain data." }, 503); }
        }
        const S = await import("@/lib/autotrade/store.server");
        const { parseUnits } = await import("viem");
        const d = await S.db();
        if (body.action === "create") {
          const b = createBody.parse(body);
          const pair = C.pairById(b.pair);
          if (!pair) throw new Error("PAIR_UNKNOWN");
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
        if (body.action === "emergency") {
          const paused = z.object({ paused: z.boolean() }).parse(body).paused;
          await d.from("autotrade_control").update({ emergency_paused: paused, updated_by: gate.admin.email, updated_at: new Date().toISOString() }).eq("id", true);
          await d.from("admin_audit_events").insert({ actor_user_id: gate.admin.userId, actor_email: gate.admin.email, actor_role: gate.admin.role, object_type: "autotrade_control", object_id: "singleton", action: paused ? "emergency_pause" : "emergency_resume", old_value: null, new_value: { paused } });
          return jsonResponse({ ok: true, paused });
        }
        if (body.action === "registry_preview") {
          const k = z.object({ key: z.enum(["caswap-v2", "bdex-v2"]) }).parse(body).key;
          const R = await import("@/lib/autotrade/registry");
          return jsonResponse({ preview: R.registerPreview(k, "0x524Db06954de917025180057BCBeB36eC96A98c5") });
        }
        const c = ctl.parse(body);
        const { data: row } = await d.from("autotrade_orders").select("order_json").eq("id", c.id).maybeSingle();
        if (!row) return jsonResponse({ error: "Not found" }, 404);
        const prev = S.deserialize(row.order_json);
        if (c.action === "tick") {
          if (prev.spec.mode !== "paper") return jsonResponse({ error: "LIVE_DISABLED" }, 403);
          const holder = crypto.randomUUID();
          const { data: fencing, error: leaseError } = await d.rpc("autotrade_acquire_lease", { _name: "autotrade-main", _holder: holder, _ttl_seconds: 30 });
          if (leaseError) throw new Error("LEASE_UNAVAILABLE");
          if (fencing === null || fencing === undefined) return jsonResponse({ error: "Worker is active; retry shortly." }, 409);
          try {
            const { data: control, error: controlError } = await d.from("autotrade_control").select("emergency_paused").eq("id", true).maybeSingle();
            if (controlError || !control || control.emergency_paused) return jsonResponse({ error: "Worker is paused or unavailable." }, 409);
            const side = prev.state === "HOLDING" ? "sell" : "buy";
            const amt = side === "buy" ? prev.spec.budgetQuote : prev.acquiredBase;
            const { quoteLeg } = await import("@/lib/autotrade/quotes.server");
            const q = (prev.state === "ARMED" || prev.state === "HOLDING")
              ? await quoteLeg(prev.spec.pair, side, E.splitRouterFee(amt, C.ROUTER_V4_FEE_BPS_BDEX_V3).swapAmount).catch(() => null)
              : null;
            const { MockPaperTransport, processTransportedPaperOrder } = await import("@/lib/autotrade/paperExecutor");
            const { SupabasePaperExecutionStore } = await import("@/lib/autotrade/paperStore.server");
            const result = await processTransportedPaperOrder({
              order: prev, quote: q, now: Date.now(), store: new SupabasePaperExecutionStore(d), transport: new MockPaperTransport(),
              lease: { holder, fencing: Number(fencing), leaseUntilMs: Date.now() + 30_000 },
            });
            const dec = JSON.parse(JSON.stringify({ ...result.decision, route: q?.route, quoteOnlyAlternatives: q?.quoteOnlyAlternatives, at: new Date().toISOString() }, (_k, v) => typeof v === "bigint" ? v.toString() : v));
            const { error: decisionError } = await d.from("autotrade_orders").update({ last_decision: dec, updated_at: new Date().toISOString() }).eq("id", prev.id).eq("version", result.order.version);
            if (decisionError) throw new Error("DECISION_UNAVAILABLE");
            return jsonResponse({ decision: dec, state: result.order.state });
          } finally {
            await d.rpc("autotrade_release_lease", { _name: "autotrade-main", _holder: holder, _fencing: fencing });
          }
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
