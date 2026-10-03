/**
 * Growth V1 — opt-in sharing and an aggregate-only referral foundation.
 * No referral rewards exist. Share cards exclude private data by default.
 */
export const SITE = "https://flowbridge.space";
export const SHAREABLE_PATHS = ["/", "/learn", "/discover", "/campaigns", "/bot-chain", "/earn", "/docs"] as const;
export const REFERRAL_REWARDS_ENABLED = false as const;
export const REFERRAL_NOTE = "Sharing is optional. There is no referral reward.";

const REF_RE = /^[a-z0-9]{8}$/;

/** Random code, never derived from wallet, email or user id. */
export function newReferralCode(rand: () => number = Math.random): string {
  const a = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += a[Math.floor(rand() * a.length)];
  return s;
}
export const isValidReferralCode = (c: unknown): c is string => typeof c === "string" && REF_RE.test(c);

export function buildShareUrl(path: string, refCode?: string | null): string | null {
  if (!(SHAREABLE_PATHS as readonly string[]).includes(path)) return null;
  const u = new URL(path, SITE);
  if (refCode && isValidReferralCode(refCode)) u.searchParams.set("ref", refCode);
  return u.toString();
}

export interface ShareCardSource {
  title: string;
  milestone: string;
  email?: string | null;
  walletAddress?: string | null;
  balance?: number | null;
  rewardAmount?: number | null;
  txAmount?: number | null;
}
export interface ShareCardOptions { showShortWallet?: boolean }
export interface ShareCard { title: string; milestone: string; wallet: string | null; url: string }

/** Only title, milestone and (optionally) a shortened wallet ever leave. */
export function buildShareCard(src: ShareCardSource, opts: ShareCardOptions = {}): ShareCard {
  const w = src.walletAddress;
  const short = opts.showShortWallet && w && /^0x[0-9a-fA-F]{40}$/.test(w) ? `${w.slice(0, 6)}…${w.slice(-4)}` : null;
  const strip = (t: string) => t.replace(/0x[0-9a-fA-F]{40}/g, "").replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "").trim();
  return { title: strip(src.title), milestone: strip(src.milestone), wallet: short, url: SITE };
}
