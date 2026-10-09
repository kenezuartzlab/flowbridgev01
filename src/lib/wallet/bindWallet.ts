/**
 * V34.2 — the one explicit Verify & Bind flow (client side).
 * Never called on connect. Signs a free, human-readable message only: no gas,
 * no approval, no transaction. The server decides; the client only reports
 * the canonical wallet it returns.
 */
import { BINDING_TTL_MS, buildBindingMessage } from "./bindingMessage";
import { walletErrorMessage } from "./walletErrors";

export const WALLET_BOUND_EVENT = "flowbridge:wallet-bound";

export async function verifyAndBindWallet(opts: {
  address: string;
  userId: string;
  token: string;
  signMessage: (message: string) => Promise<string>;
}): Promise<{ ok: true; wallet: string } | { ok: false; error: string }> {
  const wallet = opts.address.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) return { ok: false, error: "Connect a wallet first." };
  const nonceRes = await fetch("/api/public/siwe/nonce", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: wallet }),
  }).catch(() => null);
  const nonceData = (await nonceRes?.json().catch(() => null)) as { nonce?: string } | null;
  if (!nonceRes?.ok || !nonceData?.nonce) return { ok: false, error: "Could not start wallet verification. Try again." };

  const now = Date.now();
  const message = buildBindingMessage({
    domain: window.location.host,
    origin: window.location.origin,
    account: opts.userId,
    wallet,
    nonce: nonceData.nonce,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + BINDING_TTL_MS).toISOString(),
  });
  let signature: string;
  try {
    signature = await opts.signMessage(message);
  } catch (e) {
    return { ok: false, error: walletErrorMessage(e, "sign") };
  }
  const res = await fetch("/api/users/bind-wallet", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.token}` },
    body: JSON.stringify({ walletAddress: wallet, message, signature, nonce: nonceData.nonce }),
  }).catch(() => null);
  const data = (await res?.json().catch(() => null)) as { success?: boolean; walletAddress?: string | null; error?: string } | null;
  if (!res?.ok || !data?.success) return { ok: false, error: data?.error ?? "Could not bind wallet." };
  if (!data.walletAddress || data.walletAddress.toLowerCase() !== wallet)
    return { ok: false, error: "The server did not confirm this wallet — nothing was bound." };
  try {
    window.dispatchEvent(new CustomEvent(WALLET_BOUND_EVENT));
  } catch {
    /* ignore */
  }
  return { ok: true, wallet };
}
