import { getIdToken } from "@/lib/auth";

export class AutoTradeRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function callAutoTrade(wallet: string, body?: unknown, timeoutMs = 20_000) {
  const controller = new AbortController();
  let sent = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(sent && body ? "Response timed out; the paper order may have been saved. Refresh orders, or retry the unchanged review to check the same request. Do not create a second order." : "Session or request timed out. Sign in again and reconnect your bound admin wallet, then retry."));
    }, timeoutMs);
  });
  const request = async () => {
    if (!wallet) throw new Error("Connect the wallet bound to your admin account.");
    const token = await getIdToken();
    if (controller.signal.aborted) throw new Error("Session check expired; no request sent.");
    if (!token) throw new Error("Sign in with your approved admin account, then reconnect its bound wallet.");
    sent = true;
    let response: Response;
    try { response = await fetch("/api/admin/autotrade", { method: body ? "POST" : "GET", headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-wallet-address": wallet }, ...(body ? { body: JSON.stringify(body) } : {}), signal: controller.signal }); }
    catch { throw new Error(body ? "Connection interrupted; the request may have been saved. Refresh orders or retry the unchanged review; do not submit a new order." : "Could not load AutoTrade. Check your connection and retry."); }
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401) throw new AutoTradeRequestError("Your session expired. Sign in again and reconnect your bound admin wallet.", 401);
      if (response.status === 403) throw new AutoTradeRequestError(`${json?.error ?? "Access denied."} Paper order creation requires a super-admin session and that account’s connected bound wallet.`, 403);
      throw new AutoTradeRequestError(json?.error ?? `AutoTrade request failed (${response.status}). Refresh orders before retrying.`, response.status);
    }
    if (!json) throw new Error("Unexpected response. Refresh orders before retrying the unchanged review.");
    return json;
  };
  try { return await Promise.race([request(), expiry]); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}