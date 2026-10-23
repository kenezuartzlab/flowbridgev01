// Detects an already-connected wallet only; never looks up account identity.
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
}

/** Offers explicit ownership-proof sign-in without disclosing binding status. */
export async function detectLinkedWallet(): Promise<LinkedWallet | null> {
  const eth = getEthereum();
  if (!eth) return null;
  try {
    const accounts: string[] = await eth.request({ method: "eth_accounts" });
    const address = accounts?.[0]?.toLowerCase();
    if (!address) return null;
    return { address };
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
