/**
 * Sign-in return handling.
 *
 * A protected screen sends the user to Google with `redirect_uri` set to the
 * exact page they were on. Some in-app browsers drop the path from the OAuth
 * redirect, so we also stash the intended same-origin path and restore it once
 * a session exists.
 */
const KEY = "fb_return_to";

export function sanitizeReturnTo(returnTo?: string): string {
  if (typeof window === "undefined") return "/";
  if (!returnTo) return window.location.href;
  try {
    const url = new URL(returnTo, window.location.origin);
    if (url.origin !== window.location.origin) return window.location.href;
    return url.toString();
  } catch {
    return window.location.href;
  }
}

export function rememberReturnTo(returnTo?: string) {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(sanitizeReturnTo(returnTo));
    window.sessionStorage.setItem(KEY, url.pathname + url.search + url.hash);
  } catch {
    /* storage unavailable */
  }
}

/** Returns the stored path once, then clears it. */
export function takeReturnTo(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(KEY);
    if (value) window.sessionStorage.removeItem(KEY);
    return value && value.startsWith("/") ? value : null;
  } catch {
    return null;
  }
}
