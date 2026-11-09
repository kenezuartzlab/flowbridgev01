/**
 * Cross-tab single-flight guard for wallet flows. Uses Web Locks when present;
 * otherwise a short-lived storage lease (re-read after write) so mobile wallet
 * browsers without navigator.locks still cannot run two flows at once. The
 * durable nonce journal remains the duplicate-send protection either way.
 */
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const LEASE_MS = 10 * 60_000;

export async function withFlowLock<T>(key: string, fn: () => Promise<T>, env: { locks?: LockManager; store: Store; now?: () => number; id?: string } ): Promise<T> {
  if (env.locks) {
    return env.locks.request(key, { ifAvailable: true }, async (lock) => {
      if (!lock) throw new Error('This rewards flow is already open in another tab.');
      return fn();
    }) as Promise<T>;
  }
  const now = env.now ?? Date.now;
  const id = env.id ?? Math.random().toString(36).slice(2);
  const leaseKey = `${key}:lease`;
  const read = () => { try { return JSON.parse(env.store.getItem(leaseKey) ?? 'null') as { id: string; at: number } | null; } catch { return null; } };
  const held = read();
  if (held && held.id !== id && now() - held.at < LEASE_MS) throw new Error('This rewards flow is already open in another tab.');
  env.store.setItem(leaseKey, JSON.stringify({ id, at: now() }));
  if (read()?.id !== id) throw new Error('This rewards flow is already open in another tab.');
  try { return await fn(); } finally { if (read()?.id === id) env.store.removeItem(leaseKey); }
}
