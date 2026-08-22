/**
 * V15.3B §2 — wallet binding resolution, separated from connector state.
 *
 * The persisted account binding is the ONLY source of truth for "is a wallet
 * bound to this account". The browser connector's current address and chain are
 * untrusted hints that can only refine the message shown to the user; being on
 * the wrong network can never be reported as "no wallet bound".
 *
 * Pure module: no network, no storage, no environment access.
 */

export type WalletBindingStatus =
  | "NO_BOUND_WALLET"
  | "BOUND_AND_READY"
  | "BOUND_WALLET_DISCONNECTED"
  | "BOUND_WALLET_MISMATCH"
  | "BOUND_WRONG_NETWORK";

export interface WalletBindingResolution {
  status: WalletBindingStatus;
  /** Persisted bound wallet, lowercased, or null when nothing is bound. */
  boundWallet: string | null;
  /** True when preparation may proceed: a wallet IS bound to the account. */
  canPrepare: boolean;
  /** True when the user must act in their wallet before signing. */
  needsUserWalletAction: boolean;
  /** One short, honest sentence for the assistant to surface. */
  message: string | null;
}

const norm = (v: string | null | undefined): string | null => {
  const s = (v ?? "").trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(s) ? s : null;
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function chainLabel(chainId: number): string {
  if (chainId === 968) return "BOT Testnet (968)";
  if (chainId === 677) return "BOT Mainnet (677)";
  if (chainId === 56) return "BNB Chain (56)";
  if (chainId === 97) return "BNB Testnet (97)";
  return `chain ${chainId}`;
}

/**
 * Resolves binding status from the persisted binding plus optional connector
 * hints. `targetChainId` is the chain the action would be prepared for.
 */
export function resolveWalletBinding(input: {
  /** Persisted, server-known bound wallet (profile/account record). */
  boundWallet: string | null | undefined;
  /** Currently connected browser wallet address, if the client reported one. */
  connectedWallet?: string | null;
  /** Chain the connected wallet is on, if the client reported one. */
  connectedChainId?: number | null;
  /** Chain the requested action targets. */
  targetChainId: number;
}): WalletBindingResolution {
  const bound = norm(input.boundWallet);
  if (!bound) {
    return {
      status: "NO_BOUND_WALLET",
      boundWallet: null,
      canPrepare: false,
      needsUserWalletAction: true,
      message:
        "No wallet is bound to your account yet. Bind your wallet on /earn and ask me again — you always sign it yourself.",
    };
  }

  const connected = norm(input.connectedWallet);
  const target = input.targetChainId;

  if (!connected) {
    return {
      status: "BOUND_WALLET_DISCONNECTED",
      boundWallet: bound,
      canPrepare: true,
      needsUserWalletAction: true,
      message: `Your account is bound to ${short(bound)}. It isn't connected in this browser right now, so connect it on ${chainLabel(
        target,
      )} before signing — I can still prepare the plan.`,
    };
  }

  if (connected !== bound) {
    return {
      status: "BOUND_WALLET_MISMATCH",
      boundWallet: bound,
      canPrepare: true,
      needsUserWalletAction: true,
      message: `Your account is bound to ${short(bound)}, but ${short(
        connected,
      )} is connected. Switch to the bound wallet before signing — I'll prepare the plan for the bound wallet.`,
    };
  }

  if (typeof input.connectedChainId === "number" && input.connectedChainId !== target) {
    return {
      status: "BOUND_WRONG_NETWORK",
      boundWallet: bound,
      canPrepare: true,
      needsUserWalletAction: true,
      message: `Your bound wallet ${short(bound)} is connected on ${chainLabel(
        input.connectedChainId,
      )}, but this action targets ${chainLabel(
        target,
      )}. Switch network before signing — the plan itself is prepared for ${chainLabel(target)}.`,
    };
  }

  return {
    status: "BOUND_AND_READY",
    boundWallet: bound,
    canPrepare: true,
    needsUserWalletAction: false,
    message: null,
  };
}
