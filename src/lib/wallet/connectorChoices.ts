/**
 * V34.2 — brand-neutral wallet choice list (connection layer only).
 *
 * EIP-6963 discovered wallets appear as their own connectors with their real
 * name. The generic "injected" fallback is shown only when no discovered
 * wallet exists, so a click on "Rabby" never connects some other extension.
 * WalletConnect appears only when the kill switch allows it.
 */
export interface ConnectorLike {
  id: string;
  name: string;
  type: string;
  icon?: string;
}

export interface WalletChoice<C extends ConnectorLike = ConnectorLike> {
  connector: C;
  label: string;
  kind: "DISCOVERED" | "INJECTED" | "WALLETCONNECT";
}

export function buildWalletChoices<C extends ConnectorLike>(
  connectors: readonly C[],
  walletConnectEnabled: boolean,
): WalletChoice<C>[] {
  const seen = new Set<string>();
  const discovered: WalletChoice<C>[] = [];
  let generic: C | undefined;
  let wc: C | undefined;
  for (const c of connectors) {
    if (c.type === "walletConnect" || c.id === "walletConnect") {
      wc ??= c;
      continue;
    }
    if (c.id === "injected") {
      generic ??= c;
      continue;
    }
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    discovered.push({ connector: c, label: c.name || "Browser wallet", kind: "DISCOVERED" });
  }
  const out = [...discovered];
  if (!discovered.length && generic) out.push({ connector: generic, label: "Installed wallet", kind: "INJECTED" });
  if (walletConnectEnabled && wc) out.push({ connector: wc, label: "WalletConnect", kind: "WALLETCONNECT" });
  return out;
}

/** Auto-pick only when exactly one installed choice exists; never guess between several. */
export function soleInstalledChoice<C extends ConnectorLike>(choices: WalletChoice<C>[]): WalletChoice<C> | null {
  const installed = choices.filter((c) => c.kind !== "WALLETCONNECT");
  return installed.length === 1 ? installed[0] : null;
}
