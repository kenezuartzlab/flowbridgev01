/**
 * V34.2 — WALLETCONNECT_ENABLED operator kill switch.
 *
 * Fails closed: WalletConnect is only offered when the build environment sets
 * VITE_WALLETCONNECT_ENABLED=true. Injected wallets never depend on this flag.
 */
export function parseWalletConnectFlag(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const v = raw.trim().toLowerCase();
  return v === "true" || v === "1" || v === "on";
}

export const WALLETCONNECT_ENABLED: boolean = parseWalletConnectFlag(
  import.meta.env.VITE_WALLETCONNECT_ENABLED,
);

export const WALLETCONNECT_UNAVAILABLE_MESSAGE =
  "WalletConnect is temporarily unavailable. You can still use an installed wallet or wallet dapp browser.";
