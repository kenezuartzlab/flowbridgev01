/** Isolated WASM PostgreSQL fixture. Never connects to the application database. */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { managedFingerprint, managedRequestJson, type ManagedRpcStoreClient } from "@/lib/autotrade/managedStore.server";
import type { ManagedEffectRequest } from "@/lib/autotrade/liveTransport";
export const FIXTURE_ORDER = "10000000-0000-4000-8000-000000000001";
export const FIXTURE_HOLDER = "10000000-0000-4000-8000-000000000002";
export const FIXTURE_ATTEMPT = "10000000-0000-4000-8000-000000000003";
export async function managedDatabaseFixture() {
  const db = new PGlite();
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;");
  for (const name of ["0065_autotrade_v1_orders", "0066_autotrade_v1_1_worker_outbox", "0070_autotrade_managed_durable_store", "0071_autotrade_managed_cycle_receipt_fences", "0072_autotrade_managed_service_only_grants"]) await db.exec(readFileSync(`drizzle/migrations/${name}.sql`, "utf8"));
  const client: ManagedRpcStoreClient = { rpc: async (_name, a) => {
    try {
      const result = await db.query<{ result: unknown }>("SELECT public.autotrade_managed_effect($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9::jsonb) AS result", [a["_op"], a["_order_id"], a["_key"], JSON.stringify(a["_request"]), a["_fingerprint"], a["_holder"], a["_fencing"], a["_attempt"], JSON.stringify(a["_patch"])]);
      return { data: result.rows[0]?.result ?? null, error: null };
    } catch (error) { return { data: null, error: { message: error instanceof Error ? error.message : "SQL_FAILED" } }; }
  } };
  const reset = async () => {
    await db.exec("DELETE FROM autotrade_managed_effects; DELETE FROM autotrade_managed_intents; DELETE FROM autotrade_managed_nonces; DELETE FROM autotrade_events; DELETE FROM autotrade_orders; DELETE FROM autotrade_trading_accounts; UPDATE autotrade_control SET emergency_paused=false; DELETE FROM autotrade_worker_lease;");
    await db.query("INSERT INTO autotrade_worker_lease(name,holder,fencing,lease_until) VALUES('autotrade-main',$1,1,now()+interval '10 minutes')", [FIXTURE_HOLDER]);
  };
  const seed = async (requests: ManagedEffectRequest[], startIndex = 0) => {
    const first = requests[0]; if (!first) throw new Error("FIXTURE_REQUEST_REQUIRED");
    await db.query("INSERT INTO autotrade_trading_accounts(address,chain_id,status) VALUES($1,677,'active') ON CONFLICT DO NOTHING", [first.account.toLowerCase()]);
    await db.query("INSERT INTO autotrade_orders(id,created_by_email,pair,mode,state,order_json,version) VALUES($1,'offline-fixture','CA/BOT','live','ARMED',$2::jsonb,0) ON CONFLICT DO NOTHING", [FIXTURE_ORDER, JSON.stringify({ id: FIXTURE_ORDER, state: "ARMED", version: 0, acquiredBase: { $big: "0" }, proceedsQuote: { $big: "0" }, spec: { pair: "CA/BOT", mode: "live" } })]);
    for (const [index, request] of requests.entries()) await db.query("INSERT INTO autotrade_managed_intents(effect_key,order_id,account,request_json,fingerprint,order_version,execution_index,expires_at,approved,infrastructure_reviewed,security_reviewed,gas_approved,order_authorized,cap_usdt6,total_gas_cap_wei,valuation_usdt6_per_bot,valuation_at) VALUES($1,$2,$3,$4::jsonb,$5,$6,$6,now()+interval '10 minutes',true,true,true,true,true,5000000,100000000000000000,1000000,now())", [request.key, FIXTURE_ORDER, request.account.toLowerCase(), JSON.stringify(managedRequestJson(request)), managedFingerprint(request), index + startIndex]);
  };
  return { db, client, reset, seed };
}