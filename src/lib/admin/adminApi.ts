// Client helpers for the admin console. Every call carries the Supabase bearer
// token plus the connected wallet; the server re-verifies both.
import { getIdToken } from "@/lib/auth";
import type { AppConfig, RemoteToken } from "@/lib/config/appConfig";

async function headers(wallet: string) {
  const token = await getIdToken();
  if (!token) throw new Error("Sign in first.");
  return {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
    "x-wallet-address": wallet,
  };
}

async function parse(res: Response) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error ?? `Request failed (${res.status})`);
  return json as any;
}

export async function checkAdmin(wallet: string | undefined): Promise<{ isAdmin: boolean; reason?: string }> {
  if (!wallet) return { isAdmin: false, reason: "Connect your wallet." };
  try {
    const res = await fetch("/api/admin/whoami", { headers: await headers(wallet) });
    return await parse(res);
  } catch (e: any) {
    return { isAdmin: false, reason: e?.message ?? "Unavailable" };
  }
}

export async function fetchAdminConfig(wallet: string): Promise<AppConfig> {
  return parse(await fetch("/api/admin/settings", { headers: await headers(wallet) }));
}

export async function saveAdminSettings(
  wallet: string,
  payload: Partial<Pick<AppConfig, "fees" | "rewards" | "flags" | "banners">>,
) {
  return parse(
    await fetch("/api/admin/settings", {
      method: "PUT",
      headers: await headers(wallet),
      body: JSON.stringify(payload),
    }),
  );
}

export async function fetchAdminTokens(wallet: string): Promise<{ tokens: any[] }> {
  return parse(await fetch("/api/admin/tokens", { headers: await headers(wallet) }));
}

export async function saveAdminToken(wallet: string, token: RemoteToken) {
  return parse(
    await fetch("/api/admin/tokens", {
      method: "POST",
      headers: await headers(wallet),
      body: JSON.stringify(token),
    }),
  );
}

export async function deleteAdminToken(wallet: string, id: string) {
  return parse(
    await fetch("/api/admin/tokens", {
      method: "DELETE",
      headers: await headers(wallet),
      body: JSON.stringify({ id }),
    }),
  );
}
