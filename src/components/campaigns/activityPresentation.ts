/**
 * Growth Hub V3 — UI-only presentation helpers for verified activity.
 * Never authoritative: state, points and amounts come from the server.
 */
import { OFFICIAL_SOURCE_DECIMALS } from "@/lib/bridge/officialBridgeConfig";

const EXPLORERS: Record<number, string> = {
  1: "https://etherscan.io",
  56: "https://bscscan.com",
  97: "https://testnet.bscscan.com",
  137: "https://polygonscan.com",
  677: "https://scan.botchain.ai",
  968: "https://testnet.botchain.ai",
};

export function txExplorerUrl(chainId: number, hash: string): string | null {
  const base = EXPLORERS[chainId];
  return base ? `${base}/tx/${hash}` : null;
}

export const shortHash = (h: string) =>
  h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-6)}` : h;

/** Human activity kind. BRIDGE_SUBMITTED is never shown as completed. */
export function activityKindLabel(kind: string): string {
  switch (kind) {
    case "BRIDGE_SUBMITTED":
      return "Bridge submitted";
    case "BRIDGE_COMPLETED":
      return "Bridge completed";
    case "SWAP_EXECUTED":
      return "Swap executed";
    default:
      return kind.replace(/_/g, " ").toLowerCase();
  }
}

export function activityStatusLabel(status: string): string {
  switch (status.toLowerCase()) {
    case "confirmed":
      return "Verified";
    case "pending":
      return "Pending";
    case "rejected":
      return "Rejected";
    default:
      return status;
  }
}

/** Formats amountRaw with the known SOURCE-token decimals, when derivable. */
export function formatAmountRaw(amountRaw: string, sourceChainId: number): string | null {
  const decimals = OFFICIAL_SOURCE_DECIMALS[sourceChainId];
  if (decimals === undefined) return null;
  try {
    const value = BigInt(amountRaw);
    const base = 10n ** BigInt(decimals);
    const whole = value / base;
    const frac = (value % base).toString().padStart(decimals, "0").slice(0, 4).replace(/0+$/, "");
    return frac ? `${whole.toLocaleString("en-US")}.${frac}` : whole.toLocaleString("en-US");
  } catch {
    return null;
  }
}

export function formatDateTime(ts: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
