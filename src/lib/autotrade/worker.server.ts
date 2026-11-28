// AutoTrade worker: fenced lease + fresh common-block observations + durable paper
// executor transport. No live order selection, signing credentials or registry writes.
import { WORKER, nextBlockToProcess, pickBatch, percentile } from "./worker";
import { rpcConsensus, type RpcObservation } from "./executor";
import {
  MockPaperTransport,
  processTransportedPaperOrder,
  type PaperTransport,
  type PaperExecutionStore,
} from "./paperExecutor";
import { SupabasePaperExecutionStore } from "./paperStore.server";
import { processManagedOrders } from "./managedDispatch.server";

const PRIMARY = "https://rpc.botchain.ai";
const EXPLORER = "https://scan.botchain.ai/api/eth-rpc"; // Different host, same ecosystem operator: not independent infrastructure.

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
  const { data: fencing, error: leaseError } = await d.rpc("autotrade_acquire_lease", { _name: WORKER.leaseName, _holder: holder, _ttl_seconds: WORKER.ttlSeconds });
  if (leaseError) throw new Error("LEASE_UNAVAILABLE");
  if (fencing === null || fencing === undefined) return { ok: true, skipped: "LEASE_HELD" };
  const started = Date.now(); let leaseUntilMs = started + WORKER.ttlSeconds * 1000;
  const singleCycle = trigger === "cron";
  let last: number | null = null; const lat: number[] = []; let blocks = 0, skippedTotal = 0;
  try {
    while (Date.now() - started < WORKER.runMs) {
      const { data: ctl, error: controlError } = await d.from("autotrade_control").select("emergency_paused").eq("id", true).maybeSingle();
      if (controlError || !ctl) throw new Error("CONTROL_UNAVAILABLE");
      if (ctl.emergency_paused) {
        const { data: alive, error } = await d.rpc("autotrade_heartbeat", { _name: WORKER.leaseName, _holder: holder, _fencing: fencing, _ttl_seconds: WORKER.ttlSeconds, _block: last as any });
        if (error || !alive) return { ok: false, reason: "LEASE_LOST", blocks };
        leaseUntilMs = Date.now() + WORKER.ttlSeconds * 1000;
        if (singleCycle) return { ok: true, skipped: "EMERGENCY_PAUSED", mode: "paper", blocks: 0 };
        await sleep(WORKER.pollMs); continue;
      }
      let a: Awaited<ReturnType<typeof observe>>; let consensus: string | null;
      try {
        const [primary, secondary] = await Promise.all([observe(PRIMARY, null), observe(EXPLORER, null).catch(() => null)]);
        a = primary;
        if (secondary) {
          const common = Math.min(primary.head, secondary.head);
          const height = "0x" + common.toString(16);
          const [primaryHash, secondaryHash] = await Promise.all([
            primary.head === common ? Promise.resolve(primary.hashAtCommon) : jrpc(PRIMARY, "eth_getBlockByNumber", [height, false]).then(b => b?.hash ?? null),
            secondary.head === common ? Promise.resolve(secondary.hashAtCommon) : jrpc(EXPLORER, "eth_getBlockByNumber", [height, false]).then(b => b?.hash ?? null),
          ]);
          consensus = rpcConsensus({ ...primary, hashAtCommon: primaryHash }, { ...secondary, hashAtCommon: secondaryHash }, Date.now(), 10);
        } else consensus = "SECOND_RPC_MISSING";
      } catch { consensus = "PRIMARY_RPC_DOWN"; if (singleCycle) throw new Error("PRIMARY_RPC_DOWN"); await sleep(WORKER.pollMs); continue; }
      const step = nextBlockToProcess(last, a.head);
      if (step.process) {
        last = a.head; blocks++; skippedTotal += step.skipped;
        const n = consensus ? 0 : await processPaperOrders(d, holder, Number(fencing), leaseUntilMs);
        if (!consensus) await processManagedOrders(d, holder, Number(fencing));
        const latency = Date.now() - a.blockTime; lat.push(latency);
        const { error: metricError } = await d.from("autotrade_worker_metrics").insert({ holder, fencing, block: a.head, block_time: new Date(a.blockTime).toISOString(), latency_ms: latency, orders: n, skipped_blocks: step.skipped, consensus: consensus ?? "OK_SAME_OPERATOR" });
        if (metricError) throw new Error("METRICS_UNAVAILABLE");
      }
      const { data: alive, error: heartbeatError } = await d.rpc("autotrade_heartbeat", { _name: WORKER.leaseName, _holder: holder, _fencing: fencing, _ttl_seconds: WORKER.ttlSeconds, _block: last as any });
      if (heartbeatError || !alive) return { ok: false, reason: "LEASE_LOST", blocks };
      leaseUntilMs = Date.now() + WORKER.ttlSeconds * 1000;
      if (singleCycle) break; // Scheduled HTTP calls must not wait through the 45-second polling loop.
      await sleep(WORKER.pollMs);
    }
  } catch (error) {
    await d.from("autotrade_worker_lease").update({ last_error: error instanceof Error ? error.message.slice(0, 120) : "WORKER_FAILED" }).eq("name", WORKER.leaseName).eq("holder", holder).eq("fencing", fencing);
    throw error;
  } finally {
    await d.rpc("autotrade_release_lease", { _name: WORKER.leaseName, _holder: holder, _fencing: fencing });
  }
  return { ok: true, trigger, blocks, skippedTotal, p50: percentile(lat, 50), p95: percentile(lat, 95), mode: "paper", transport: "mock", rpcOperatorIndependence: false, singleCycle, durationMs: Date.now() - started };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function processPaperOrders(
  d: any,
  holder: string,
  fencing: number,
  leaseUntilMs: number,
  deps: {
    transport?: PaperTransport;
    store?: PaperExecutionStore;
    quote?: typeof import("./quotes.server").quoteLeg;
    now?: () => number;
  } = {},
) {
  const { data, error } = await d.from("autotrade_orders")
    .select("id,order_json,updated_at")
    .in("state", ["ARMED", "HOLDING", "BUY_SUBMITTED", "SELL_SUBMITTED", "PAUSED", "FAILED"])
    .eq("mode", "paper").order("updated_at").limit(50);
  if (error) throw new Error("ORDERS_UNAVAILABLE");
  const batch: any[] = pickBatch((data ?? []).map((r: any) => ({ ...r, checkedAt: Date.parse(r.updated_at) })));
  const S = await import("./store.server");
  const transport = deps.transport ?? new MockPaperTransport();
  const store = deps.store ?? new SupabasePaperExecutionStore(d);
  const quote = deps.quote ?? (await import("./quotes.server")).quoteLeg;
  const now = deps.now ?? Date.now;
  let n = 0;
  let failures = 0;
  for (const row of batch) {
    const prev = S.deserialize(row.order_json);
    try {
      const needsQuote = prev.state === "ARMED" || prev.state === "HOLDING";
      const side = prev.state === "HOLDING" ? "sell" : "buy";
      const amt = side === "buy" ? prev.spec.budgetQuote : prev.acquiredBase;
      const q = needsQuote
        ? await quote(prev.spec.pair, side, (await import("./engine")).splitRouterFee(amt, (await import("./config")).ROUTER_V4_FEE_BPS_BDEX_V3).swapAmount).catch(() => null)
        : null;
      const result = await processTransportedPaperOrder({ order: prev, quote: q, now: now(), store, transport, lease: { holder, fencing, leaseUntilMs } });
      const dec = JSON.parse(JSON.stringify({ ...result.decision, route: q?.route, quoteOnlyAlternatives: q?.quoteOnlyAlternatives, at: new Date(now()).toISOString(), by: "worker" }, (_k, v) => typeof v === "bigint" ? v.toString() : v));
      if (result.order === prev) {
        const { error: decisionError } = await d.from("autotrade_orders").update({ last_decision: dec, updated_at: new Date(now()).toISOString() }).eq("id", prev.id).eq("version", prev.version);
        if (decisionError) throw new Error("DECISION_UNAVAILABLE");
      }
      n++;
    } catch (error) {
      failures++;
      const reason = error instanceof Error ? error.message.slice(0, 120) : "PAPER_EXECUTION_FAILED";
      const { error: failureWriteError } = await d.from("autotrade_orders").update({ last_decision: { kind: "reject", reason, at: new Date(now()).toISOString() }, updated_at: new Date(now()).toISOString() }).eq("id", prev.id).eq("version", prev.version);
      if (failureWriteError) throw new Error("FAILURE_RECORD_UNAVAILABLE");
    }
  }
  if (failures > 0) throw new Error(`PAPER_ORDER_FAILURES:${failures}`);
  return n;
}
