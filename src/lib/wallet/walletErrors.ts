/** V34.2 — normalize provider-specific wallet errors into user-facing states. */
export type WalletErrorState =
  | "USER_REJECTED"
  | "WRONG_NETWORK"
  | "WALLET_DISCONNECTED"
  | "SESSION_EXPIRED"
  | "INSUFFICIENT_GAS"
  | "RPC_UNAVAILABLE"
  | "TRANSACTION_FAILED"
  | "SIGNATURE_FAILED"
  | "WALLETCONNECT_UNAVAILABLE";

export const WALLET_ERROR_MESSAGES: Record<WalletErrorState, string> = {
  USER_REJECTED: "You cancelled the request in your wallet. Nothing changed.",
  WRONG_NETWORK: "Your wallet is on a different network. Switch networks and try again.",
  WALLET_DISCONNECTED: "Your wallet disconnected. Reconnect it to continue.",
  SESSION_EXPIRED: "This wallet session expired. Reconnect and try again.",
  INSUFFICIENT_GAS: "Not enough native coin to pay network gas.",
  RPC_UNAVAILABLE: "The network is not responding right now. Try again in a moment.",
  TRANSACTION_FAILED: "The transaction failed. No reward or balance was changed by FlowBridge.",
  SIGNATURE_FAILED: "The signature could not be verified. Nothing was bound.",
  WALLETCONNECT_UNAVAILABLE:
    "WalletConnect is temporarily unavailable. You can still use an installed wallet or wallet dapp browser.",
};

export function classifyWalletError(e: unknown, context: "sign" | "tx" | "connect" = "sign"): WalletErrorState {
  const err = (e ?? {}) as { code?: number | string; name?: string; message?: string; shortMessage?: string; cause?: any };
  const code = err.code ?? err.cause?.code;
  const text = `${err.name ?? ""} ${err.shortMessage ?? ""} ${err.message ?? ""} ${err.cause?.message ?? ""}`.toLowerCase();
  if (code === 4001 || code === "ACTION_REJECTED" || /user (rejected|denied|cancel)|rejected the request|user rejected/.test(text))
    return "USER_REJECTED";
  if (/walletconnect|relay|project id|projectid/.test(text)) return "WALLETCONNECT_UNAVAILABLE";
  if (code === 4902 || /chain mismatch|wrong network|unrecognized chain|unsupported chain/.test(text)) return "WRONG_NETWORK";
  if (/session.*(expired|not found)|expired session/.test(text)) return "SESSION_EXPIRED";
  if (code === 4900 || code === 4901 || /disconnected|connector not connected|not connected/.test(text)) return "WALLET_DISCONNECTED";
  if (/insufficient funds|gas required exceeds|intrinsic gas/.test(text)) return "INSUFFICIENT_GAS";
  if (code === -32603 || /fetch failed|network error|timeout|http request failed|rpc/.test(text)) return "RPC_UNAVAILABLE";
  return context === "tx" ? "TRANSACTION_FAILED" : context === "connect" ? "WALLET_DISCONNECTED" : "SIGNATURE_FAILED";
}

export function walletErrorMessage(e: unknown, context: "sign" | "tx" | "connect" = "sign"): string {
  return WALLET_ERROR_MESSAGES[classifyWalletError(e, context)];
}
