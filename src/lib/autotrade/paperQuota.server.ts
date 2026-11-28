import { ACTIVE_PAPER_STATES, PAPER_QUOTA } from "./paperPermissions";
import { db } from "./store.server";

/** Server-side counts for one account's paper orders; fails closed when unreadable. */
export async function readPaperQuota(email: string, now: number): Promise<{ createdLastHour: number; active: number } | null> {
  const d = await db();
  const since = new Date(now - PAPER_QUOTA.windowMs).toISOString();
  const [recent, active] = await Promise.all([
    d.from("autotrade_orders").select("id", { count: "exact", head: true }).eq("created_by_email", email).eq("mode", "paper").gte("created_at", since),
    d.from("autotrade_orders").select("id", { count: "exact", head: true }).eq("created_by_email", email).eq("mode", "paper").in("state", ACTIVE_PAPER_STATES),
  ]);
  if (recent.error || active.error || recent.count === null || active.count === null) return null;
  return { createdLastHour: recent.count, active: active.count };
}
