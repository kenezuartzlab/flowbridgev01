/**
 * V36.7 — pending referral attribution (client). Survives navigation, new
 * tabs, OAuth redirects, email verification and wallet-browser restarts via
 * localStorage. First validated code wins; the server alone binds it.
 */
const KEY = "fb_pending_referral_v1";
const LEGACY_KEY = "flowbridge_referred_by";
export const PENDING_REFERRAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface Pending { code: string; capturedAt: number }

export function normalizeCode(code: string | null | undefined): string | null {
  const c = (code ?? "").trim().toUpperCase();
  return /^FB-[A-Z0-9]{5}$/.test(c) ? c : null;
}

export function readPending(raw: string | null, now = Date.now()): Pending | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Pending;
    const code = normalizeCode(p.code);
    if (!code || !Number.isFinite(p.capturedAt) || now - p.capturedAt > PENDING_REFERRAL_TTL_MS) return null;
    return { code, capturedAt: p.capturedAt };
  } catch {
    return null;
  }
}

function store(): Storage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}

export function getPendingReferralCode(): string | undefined {
  return readPending(store()?.getItem(KEY) ?? null)?.code;
}

export function clearPendingReferral() {
  try { store()?.removeItem(KEY); sessionStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
}

/** Server outcomes that end the pending state; PENDING keeps it for retry. */
export function settlePendingReferral(result: { outcome?: string } | null | undefined) {
  if (result?.outcome && result.outcome !== "PENDING" && result.outcome !== "NONE") clearPendingReferral();
}

/** Validates `?ref=` on the server and stores it if no pending code exists. */
export async function captureReferralFromUrl(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const code = normalizeCode(new URLSearchParams(window.location.search).get("ref"));
  const existing = getPendingReferralCode();
  if (!code) return existing ?? null;
  if (existing) return existing; // first valid capture wins
  try {
    const res = await fetch("/api/public/referral/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = (await res.json()) as { valid?: boolean };
    if (!res.ok || !data.valid) return null;
    store()?.setItem(KEY, JSON.stringify({ code, capturedAt: Date.now() }));
    return code;
  } catch {
    return null;
  }
}
