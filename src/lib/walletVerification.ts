// SIWE-based ownership gate. Before a wallet can execute its first swap or
// bridge in a session, it must produce a signature over a fresh server-issued
// nonce. Watch-only wallets cannot sign, so they are stopped before signing
// any state-changing transaction. Verification is cached per-address in
// sessionStorage so users only sign once per browser session.

const STORAGE_PREFIX = "flowbridge:wallet-verified:";

function storageKey(address: string) {
  return `${STORAGE_PREFIX}${address.toLowerCase()}`;
}

export function isWalletVerified(address: string): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(storageKey(address)) === "1";
  } catch {
    return false;
  }
}

export function clearWalletVerified(address: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(storageKey(address));
  } catch {
    /* ignore */
  }
}

function markVerified(address: string): void {
  try {
    sessionStorage.setItem(storageKey(address), "1");
  } catch {
    /* ignore */
  }
}

function buildMessage(opts: { address: string; nonce: string; domain: string; uri: string }) {
  const issuedAt = new Date().toISOString();
  return [
    `${opts.domain} wants you to sign in with your Ethereum account:`,
    opts.address,
    "",
    "Prove control of this wallet to authorize swaps and bridges on FlowBridge. This signature is free and does not send a transaction.",
    "",
    `URI: ${opts.uri}`,
    `Version: 1`,
    `Nonce: ${opts.nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

export class WalletVerificationRejectedError extends Error {
  constructor(message = "Wallet signature was rejected. Approve the signature request to continue.") {
    super(message);
    this.name = "WalletVerificationRejectedError";
  }
}

/**
 * Ensure the given wallet address has proved key control this session.
 * Skips the round-trip if already verified. Throws on rejection/failure so
 * callers can abort the swap/bridge before writing a transaction.
 */
export async function ensureWalletVerified(
  address: string,
  signMessageAsync: (args: { account: `0x${string}`; message: string }) => Promise<string>,
): Promise<void> {
  if (!address) throw new Error("Wallet address required for verification");
  const normalized = address.toLowerCase();
  if (isWalletVerified(normalized)) return;

  // 1) Get nonce
  const nonceRes = await fetch("/api/public/siwe/nonce", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: normalized }),
  });
  const nonceJson = await nonceRes.json().catch(() => ({}));
  if (!nonceRes.ok || !nonceJson?.nonce) {
    throw new Error(nonceJson?.error ?? "Could not start wallet verification");
  }
  const nonce: string = nonceJson.nonce;

  const message = buildMessage({
    address: normalized,
    nonce,
    domain: window.location.host,
    uri: window.location.origin,
  });

  // 2) Sign — this is where watch-only wallets fail out.
  let signature: string;
  try {
    signature = await signMessageAsync({
      account: normalized as `0x${string}`,
      message,
    });
  } catch (err: any) {
    const msg = String(err?.shortMessage || err?.message || "");
    if (/reject|denied|cancel/i.test(msg)) throw new WalletVerificationRejectedError();
    throw new WalletVerificationRejectedError(
      "This wallet could not produce a signature. Watch-only wallets cannot swap or bridge — reconnect with a signing wallet.",
    );
  }

  // 3) Server-verify
  const verifyRes = await fetch("/api/public/siwe/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: normalized, message, signature, nonce }),
  });
  const verifyJson = await verifyRes.json().catch(() => ({}));
  if (!verifyRes.ok || !verifyJson?.verified) {
    throw new Error(verifyJson?.error ?? "Wallet verification failed");
  }

  markVerified(normalized);
}
