/**
 * V36.1 — pure header network label. The connected WALLET's chain always wins
 * over the selected product network, so BOT Mainnet is never shown while the
 * wallet actually sits on BNB, Ethereum, Polygon or another chain.
 */
const NAMES: Record<number, string> = {
  677: "BOT Mainnet",
  968: "BOT Testnet",
  56: "BNB Chain",
  97: "BNB Testnet",
  1: "Ethereum",
  11155111: "Sepolia",
  137: "Polygon",
};

export interface HeaderNetworkLabel {
  label: string;
  isBot: boolean;
  /** Wallet is connected to a chain different from the selected BOT network. */
  mismatch: boolean;
}

export function headerNetworkLabel(input: { selectedMainnet: boolean; walletChainId: number | null; tronConnected?: boolean }): HeaderNetworkLabel {
  const selected = input.selectedMainnet ? "BOT Mainnet" : "BOT Testnet";
  if (input.walletChainId == null) {
    if (input.tronConnected) return { label: "Tron", isBot: false, mismatch: true };
    return { label: selected, isBot: true, mismatch: false };
  }
  const id = input.walletChainId;
  const label = NAMES[id] ?? `Chain ${id}`;
  const isBot = id === 677 || id === 968;
  return { label, isBot, mismatch: label !== selected };
}
