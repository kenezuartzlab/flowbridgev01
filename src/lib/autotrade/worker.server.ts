// AutoTrade worker: one invocation per cron minute holds a fenced DB lease, polls
// BOT blocks (~1.5s), cross-checks the head/hash against an independent data path
// (explorer), and advances PAPER orders only. Live orders are never executed here.
import { WORKER, nextBlockToProcess, pickBatch, percentile } from "./worker";
import { rpcConsensus, type RpcObservation } from "./executor";

const PRIMARY = "https://rpc.botchain.ai";
const EXPLORER = "https://scan.botchain.ai/api/eth-rpc"; // Blockscout: different host/path, same ecosystem operator

async function jrpc(url: string, method: string, params: unknown[] = []) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(5_000) });
  const j: any = await r.json(); if (j.error || j.result === undefined) throw new Error("RPC"); return j.result;
}
export async function observe(url: string, common: number | null): Promise<RpcObservation & { blockTime: number }> {
  const [cid, headHex] = await Promise.all([jrpc(url, "eth_chainId"), jrpc(url, "eth_blockNumber")]);
  const head = Number(BigInt(headHex)); const at = common ?? head;
  const b = await jrpc(url, "eth_getBlockByNumber", ["0x" + at.toString(16), false]);
  return { host: url, chainId: Number(BigInt(cid)), head, hashAtCommon: b?.hash ?? null, observedAt: Date.now(), blockTime: b ? Number(BigInt(b.timestamp)) * 1000 : 0 };
}

export async function runWorker(trigger: string) {
  const { db } = await import("./store.server");
  const d = await db(); const holder = crypto.randomUUID();
  const { data: fencing } = await d.rpc("autotrade_acquire_lease", { _name: WORKER.leaseName, _holder: holder, _ttl_seconds: WORKER.ttlSeconds });
  if (fencing === null || fencing === undefined) return { ok: true, skipped: "LEASE_HELD" };
  const started = Date.now(); let last: number | null = null; const lat: number[] = []; let blocks = 0, skippedTotal = 0;
  try {
    while (Date.now() - started < WORKER.runMs) {
      const { data: ctl } = await d.from("autotrade_control").select("emergency_paused").eq("id", true).maybeSingle();
      if (ctl?.emergency_paused) { await d.rpc("autotrade_heartbeat", { _name: WORKER.leaseName, _holder: holder, _fencing: fencing, _ttl_seconds: WORKER.ttlSeconds, _block: last as any }); await sleep(WORKER.pollMs); continue; }
      let a: Awaited<ReturnType<typeof observe>>; let consensus: string | null;
      try {
        a = await observe(PRIMARY, null);
        const b = await observe(EXPLORER, Math.min(a.head, a.head)).catch(() => null);
        const bb = b ? await observe(EXPLORER, Math.min(a.head, b.head)) : null;
        const aa = bb ? { ...a, hashAtCommon: (await jrpc(PRIMARY, "eth_getBlockByNumber", ["0x" + Math.min(a.head, bb.head).toString(16), false]))?.hash ?? null } : a;
        consensus = bb ? rpcConsensus(aa, bb, Date.now(), 10) : "SECOND_RPC_MISSING"; // explorer indexes ~1s blocks with a few blocks of lag
      } catch { consensus = "PRIMARY_RPC_DOWN"; await sleep(WORKER.pollMs); continue; }
      const step = nextBlockToProcess(last, a.head);
      if (step.process) {
        last = a.head; blocks++; skippedTotal += step.skipped;
        const n = consensus ? 0 : await processPaperOrders(d, holder);
        const latency = Date.now() - a.blockTime; lat.push(latency);
        await d.from("autotrade_worker_metrics").insert({ holder, fencing, block: a.head, block_time: new Date(a.blockTime).toISOString(), latency_ms: latency, orders: n, skipped_blocks: step.skipped, consensus: consensus ?? "OK" });
      }
      const { data: alive } = await d.rpc("autotrade_heartbeat", { _name: WORKER.leaseName, _holder: holder, _fencing: fencing, _ttl_seconds: WORKER.ttlSeconds, _block: last as any });
      if (!alive) return { ok: false, reason: "LEASE_LOST", blocks };
      await sleep(WORKER.pollMs);
    }
  } finally { await d.rpc("autotrade_release_lease", { _name: WORKER.leaseName, _holder: holder, _fencing: fencing }); }
  return { ok: true, trigger, blocks, skippedTotal, p50: percentile(lat, 50), p95: percentile(lat, 95) };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function processPaperOrders(d: any, holder: string) {
  const { data } = await d.from("autotrade_orders").select("id,order_json,updated_at").in("state", ["ARMED", "HOLDING"]).eq("mode", "paper").order("updated_at").limit(50);
  const batch: any[] = pickBatch((data ?? []).map((r: any) => ({ ...r, checkedAt: Date.parse(r.updated_at) })));
  const E = await import("./engine"); const C = await import("./config"); const S = await import("./store.server"); const { quoteLeg } = await import("./quotes.server");
  let n = 0;
  for (const row of batch) { // orderConcurrency = 1 keeps quote fetches within the 6-connection budget
    try {
      const prev = S.deserialize(row.order_json);
      const side = prev.state === "HOLDING" ? "sell" : "buy";
      const amt = side === "buy" ? prev.spec.budgetQuote : prev.acquiredBase;
      const q = await quoteLeg(prev.spec.pair, side, E.splitRouterFee(amt, C.ROUTER_V4_FEE_BPS_BDEX_V3).swapAmount);
      const { order, decision } = E.paperStep(prev, q, Date.now(), C.ROUTER_V4_FEE_BPS_BDEX_V3);
      const dec = JSON.parse(JSON.stringify({ ...decision, at: new Date().toISOString(), by: "worker" }, (_k, v) => typeof v === "bigint" ? v.toString() : v));
      if (order !== prev) await S.commit(prev, order, `worker:${holder.slice(0, 8)}`, { type: "worker_tick", decision: dec }, dec);
      else await d.from("autotrade_orders").update({ last_decision: dec, updated_at: new Date().toISOString() }).eq("id", prev.id).eq("version", prev.version);
      n++;
    } catch { /* CONCURRENT_UPDATE or quote failure: next block retries */ }
  }
  return n;
}
