// Detects an already-connected wallet only; never looks up account identity.
import { signInWithEthereum } from "@/lib/siwe";
import { getActiveProvider } from '@/lib/wallet/activeProvider';
import { stringToHex } from 'viem';

type Eth = {
  request: (args: { method: string; params?: unknown[] }) => Promise<any>;
};

async function getEthereum(): Promise<Eth | null> {
  return await getActiveProvider() as Eth | null;
}

export interface LinkedWallet {
  address: string;
}

/** Offers explicit ownership-proof sign-in without disclosing binding status. */
export async function detectLinkedWallet(): Promise<LinkedWallet | null> {
  const eth = await getEthereum();
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
  const eth = await getEthereum();
  if (!eth) throw new Error("No browser wallet detected.");
  const normalized = address.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) throw new Error('Select a valid wallet account.');
  let chainId = 677;
  try {
    const hex: string = await eth.request({ method: "eth_chainId" });
    chainId = Number.parseInt(hex, 16) || chainId;
  } catch {
    /* keep default */
  }
  return signInWithEthereum({
    address: normalized,
    chainId,
    signMessage: async (msg) => {
      const accounts = await eth.request({ method: 'eth_accounts' });
      if (!Array.isArray(accounts) || accounts[0]?.toLowerCase() !== normalized) {
        throw new Error('Wallet account changed. Start sign-in again with the selected wallet.');
      }
      // EIP-1193 wallets expect UTF-8 bytes, not a raw multiline string.
      // Encoding changes transport only: the server verifies the same message.
      const signature = await eth.request({ method: 'personal_sign', params: [stringToHex(msg), normalized] });
      const current = await eth.request({ method: 'eth_accounts' });
      if (!Array.isArray(current) || current[0]?.toLowerCase() !== normalized) {
        throw new Error('Wallet account changed. Start sign-in again with the selected wallet.');
      }
      return signature;
    },
  });
}
