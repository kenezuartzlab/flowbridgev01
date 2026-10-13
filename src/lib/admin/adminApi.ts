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
  payload: Partial<Pick<AppConfig, "fees" | "rewards" | "flags" | "social" | "content" | "banners" | "partners" | "quickActions" | "pages">>,
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

/** Uploads banner artwork; returns the served image URL. */
export async function uploadBannerImage(wallet: string, file: File): Promise<{ url: string }> {
  const h = await headers(wallet);
  delete (h as any)["content-type"];
  const form = new FormData();
  form.append("file", file);
  return parse(await fetch("/api/admin/banner-upload", { method: "POST", headers: h, body: form }));
}

export interface BannerStat {
  surface: string;
  slideId: string;
  impressions: number;
  clicks: number;
  ctr: number;
}

export async function fetchBannerStats(
  wallet: string,
  days = 30,
): Promise<{ days: number; stats: BannerStat[] }> {
  return parse(
    await fetch(`/api/admin/banner-stats?days=${days}`, { headers: await headers(wallet) }),
  );
}


/** PRIVATE application materials (dossier, pitch deck) — signed, expiring links. */
export async function fetchApplicationMaterials(
  wallet: string,
): Promise<{ files: { id: string; title: string; url: string | null }[]; expiresInSeconds: number }> {
  return parse(await fetch("/api/admin/application-materials", { headers: await headers(wallet) }));
}

/** PRIVATE Scheme A readiness + on-chain evidence (read-only chain data). */
export async function fetchApplicationReadiness(wallet: string): Promise<any> {
  return parse(await fetch("/api/admin/application-readiness", { headers: await headers(wallet) }));
}

/** PRIVATE: downloads a current master-refresh file through the admin gate. */
export async function downloadApplicationFile(wallet: string, id: string, filename: string) {
  const res = await fetch(`/api/admin/application-files?id=${encodeURIComponent(id)}`, { headers: await headers(wallet) });
  if (!res.ok) await parse(res);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function fetchLaunchPreparation(wallet: string) {
  return parse(await fetch("/api/admin/launch-preparation", { headers: await headers(wallet) }));
}
export async function saveLaunchPreparation(wallet: string, tracker: import("@/lib/application/launchTracker").LaunchTracker) {
  return parse(await fetch("/api/admin/launch-preparation", { method: "PUT", headers: await headers(wallet), body: JSON.stringify(tracker) }));
}
export async function uploadLaunchScreenshot(wallet: string, file: File): Promise<{ path: string }> {
  const h = await headers(wallet);
  const form = new FormData(); form.append("file", file);
  return parse(await fetch("/api/admin/launch-preparation", { method: "POST", headers: { authorization: h.authorization, "x-wallet-address": wallet }, body: form }));
}
export async function downloadLaunchScreenshot(wallet: string, path: string) {
  const res = await fetch(`/api/admin/launch-preparation?screenshot=${encodeURIComponent(path)}`, { headers: await headers(wallet) });
  if (!res.ok) await parse(res);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a"); a.href = url; a.download = path.split("/").pop() ?? "evidence.png"; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
