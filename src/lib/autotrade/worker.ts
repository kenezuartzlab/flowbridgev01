// Pure scheduling helpers for the AutoTrade worker (tested in worker.test.ts).
export const WORKER = { leaseName: "autotrade-main", ttlSeconds: 30, runMs: 45_000, pollMs: 1_500, maxOrdersPerBlock: 6, orderConcurrency: 1 } as const;
/** Backpressure: always jump to the newest block; report how many were coalesced. */
export function nextBlockToProcess(lastProcessed: number | null, head: number) {
  if (lastProcessed !== null && head <= lastProcessed) return { process: false as const, skipped: 0 };
  return { process: true as const, skipped: lastProcessed === null ? 0 : Math.max(0, head - lastProcessed - 1) };
}
/** Bounded, fair batch: oldest-checked first, never more than the cap per block. */
export function pickBatch<T extends { id: string; checkedAt: number }>(orders: T[], cap: number = WORKER.maxOrdersPerBlock): T[] {
  return [...orders].sort((a, b) => a.checkedAt - b.checkedAt || a.id.localeCompare(b.id)).slice(0, cap);
}
export function percentile(xs: number[], p: number): number | null {
  if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!;
}
/** Run tasks with at most `limit` in flight (outbound fetch budget is 6 per invocation). */
export async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]!); } }));
  return out;
}
