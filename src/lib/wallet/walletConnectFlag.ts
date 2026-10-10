/**
 * V34.2D — WALLETCONNECT_ENABLED operator kill switch (preview-only gate).
 *
 * Resolution (fails closed):
 *  1. VITE_WALLETCONNECT_ENABLED explicitly off ("false"/"0"/"off") -> OFF everywhere (kill switch).
 *  2. Production hosts (flowbridge.space family, flowbridgev01.lovable.app) -> ON only with explicit env "true".
 *  3. Preview hosts (id-preview--*.lovable.app, *--preview / localhost) -> ON.
 *  4. Anything else / SSR -> OFF.
 * Injected wallets never depend on this flag.
 */
export function parseWalletConnectFlag(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const v = raw.trim().toLowerCase();
  return v === "true" || v === "1" || v === "on";
}

function isExplicitOff(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const v = raw.trim().toLowerCase();
  return v === "false" || v === "0" || v === "off" || v === "disabled";
}

export const PRODUCTION_HOSTS = [
  "flowbridge.space",
  "www.flowbridge.space",
  "notify.flowbridge.space",
  "flowbridgev01.lovable.app",
];

export function isPreviewHost(host: string): boolean {
  const h = host.toLowerCase();
  if (PRODUCTION_HOSTS.includes(h)) return false;
  if (/^id-preview--[a-z0-9-]+\.lovable\.app$/.test(h)) return true;
  if (/^[a-z0-9-]+--preview\.lovable\.app$/.test(h)) return true;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(h)) return true;
  return false;
}

export function resolveWalletConnectEnabled(raw: unknown, host: string | null): boolean {
  if (isExplicitOff(raw)) return false;
  if (!host) return false;
  if (PRODUCTION_HOSTS.includes(host.toLowerCase())) return parseWalletConnectFlag(raw);
  return parseWalletConnectFlag(raw) || isPreviewHost(host);
}

export const WALLETCONNECT_ENABLED: boolean = resolveWalletConnectEnabled(
  import.meta.env.VITE_WALLETCONNECT_ENABLED,
  typeof window !== "undefined" ? window.location.host : null,
);

export const WALLETCONNECT_UNAVAILABLE_MESSAGE =
  "WalletConnect is temporarily unavailable. You can still use an installed wallet.";
