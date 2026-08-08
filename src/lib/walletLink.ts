// Detects whether an already-connected browser wallet is bound to a registered
// FlowBridge account, so pages can offer "Sign in with wallet" instead of
// forcing a Google sign-in. Read-only: never prompts a wallet connection.
import { signInWithEthereum } from "@/lib/siwe";

type Eth = {
  request: (args: { method: string; params?: unknown[] }) => Promise<any>;
};

function getEthereum(): Eth | null {
  const eth = (globalThis as any)?.ethereum;
  return eth && typeof eth.request === "function" ? (eth as Eth) : null;
}

export interface LinkedWallet {
  address: string;
  /** Masked email hint of the bound account, e.g. "k•••2@g•••.com". */
  emailHint: string;
}

/** Returns the connected wallet + masked email when it is already bound. */
export async function detectLinkedWallet(): Promise<LinkedWallet | null> {
  const eth = getEthereum();
  if (!eth) return null;
  try {
    const accounts: string[] = await eth.request({ method: "eth_accounts" });
    const address = accounts?.[0]?.toLowerCase();
    if (!address) return null;
    const res = await fetch("/api/public/wallet-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: address }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { bound?: boolean; emailHint?: string };
    if (!data.bound) return null;
    return { address, emailHint: data.emailHint ?? "" };
  } catch {
    return null;
  }
}

/** Signs the SIWE message with the injected wallet and creates the session. */
export async function signInWithLinkedWallet(address: string) {
  const eth = getEthereum();
  if (!eth) throw new Error("No browser wallet detected.");
  let chainId = 677;
  try {
    const hex: string = await eth.request({ method: "eth_chainId" });
    chainId = Number.parseInt(hex, 16) || chainId;
  } catch {
    /* keep default */
  }
  return signInWithEthereum({
    address,
    chainId,
    signMessage: (msg) => eth.request({ method: "personal_sign", params: [msg, address] }),
  });
}
