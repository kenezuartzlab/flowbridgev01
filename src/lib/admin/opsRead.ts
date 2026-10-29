import { getIdToken } from "@/lib/auth";

/** Bound read-only checks, including session initialization. Never retry a write. */
export async function readOpsJson<T>(path: string, wallet?: string, timeoutMs = 20_000, readAction?: string): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("The operator check took too long. Retry, or reconnect your bound wallet."));
    }, timeoutMs);
  });
  const request = async () => {
    const token = await getIdToken();
    if (controller.signal.aborted) throw new Error("Operator check expired.");
    if (!token) throw new Error("Sign in with your approved operator account to continue.");
    if (!wallet) throw new Error("Connect the wallet bound to your admin account.");
    const res = await fetch(path, { headers: { authorization: `Bearer ${token}`, "x-wallet-address": wallet, ...(readAction ? { "content-type": "application/json" } : {}) }, signal: controller.signal,
      ...(readAction ? { method: "POST", body: JSON.stringify({ action: readAction }) } : {}) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error ?? `Operator check failed (${res.status}).`);
    return json as T;
  };
  try { return await Promise.race([request(), timeout]); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}