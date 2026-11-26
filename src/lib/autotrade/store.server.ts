// Durable AutoTrade order store with optimistic versioning (service-role only).
import type { Order } from "./engine";
import { pairById } from "./config";

const big = (_k: string, v: unknown) => (typeof v === "bigint" ? { $big: v.toString() } : v);
export function serialize(o: Order) { return JSON.parse(JSON.stringify({ ...o, spec: { ...o.spec, pair: o.spec.pair.id } }, big)); }
export function deserialize(j: any): Order {
  const revive = (x: any): any => x && typeof x === "object" ? ("$big" in x ? BigInt(x.$big) : Array.isArray(x) ? x.map(revive) : Object.fromEntries(Object.entries(x).map(([k, v]) => [k, revive(v)]))) : x;
  const o = revive(j); const pair = pairById(o.spec.pair); if (!pair) throw new Error("UNKNOWN_PAIR");
  return { ...o, spec: { ...o.spec, pair } };
}

export async function db() { return (await import("@/integrations/supabase/client.server")).supabaseAdmin; }

/** Write only if nobody advanced the order meanwhile; event row is unique per version. */
export async function commit(prev: Order, next: Order, actor: string, event: unknown, decision?: unknown) {
  const d = await db();
  if (next === prev) return prev;
  const { data, error } = await d.from("autotrade_orders")
    .update({ order_json: serialize(next), state: next.state, version: next.version, last_decision: (decision ?? null) as any, updated_at: new Date().toISOString() })
    .eq("id", prev.id).eq("version", prev.version).select("id");
  if (error || !data?.length) throw new Error("CONCURRENT_UPDATE");
  await d.from("autotrade_events").insert({ order_id: prev.id, version: next.version, actor_email: actor, event: JSON.parse(JSON.stringify(event, big)) });
  return next;
}
