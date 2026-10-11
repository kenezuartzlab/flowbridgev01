/**
 * Returns the EIP-1193 provider of the wallet the user actually connected
 * through the shared picker (installed wallet OR WalletConnect), falling back
 * to window.ethereum. Read-only: never requests accounts or signatures itself.
 */
import { getAccount } from '@wagmi/core';
import { wagmiConfig } from '@/lib/wagmi';

export type Eip1193 = { request: (a: { method: string; params?: unknown }) => Promise<unknown> };

export async function getActiveProvider(): Promise<Eip1193 | null> {
  try {
    const acct = getAccount(wagmiConfig);
    if (acct.status === 'connected' && acct.connector?.getProvider) {
      const p = (await acct.connector.getProvider()) as Eip1193 | undefined;
      if (p?.request) return p;
    }
  } catch {
    /* fall through to injected */
  }
  const injected = (globalThis as { window?: { ethereum?: Eip1193 } }).window?.ethereum;
  return injected ?? null;
}
