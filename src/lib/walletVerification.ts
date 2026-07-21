// SIWE-based ownership gate. Before a wallet can execute its first swap or
// bridge in a session, it must produce a signature over a fresh server-issued
// nonce. Watch-only wallets cannot sign, so they are stopped before signing
// any state-changing transaction. Verification is cached per-address in
// sessionStorage so users only sign once per browser session.

const STORAGE_PREFIX = "flowbridge:wallet-verified:";
const SIGNATURE_TIMEOUT_MS = 35_000;

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

export function getWalletSignatureErrorMessage(err: any) {
  const msg = String(err?.shortMessage || err?.details || err?.message || err || "");
  if (/request.*pending|already.*pending|already processing|resource unavailable|request already/i.test(msg)) {
    return "A wallet signature request is already open. Close the old wallet prompt, reopen/unlock your wallet, then tap retry.";
  }
  if (/reject|denied|cancel|user rejected/i.test(msg)) {
    return "Wallet signature was rejected. Approve the signature request to continue.";
  }
  if (/timed out|timeout|no wallet signature/i.test(msg)) {
    return "No wallet signature received. Reopen/unlock your wallet, approve the signature prompt, then try again.";
  }
  if (/active wallet changed/i.test(msg)) return msg;
  return "This wallet could not produce a signature. Watch-only wallets cannot swap or bridge — reconnect with a signing wallet.";
}

async function assertActiveInjectedAccount(expectedAddress: string): Promise<void> {
  if (typeof window === "undefined") return;
  const eth = (window as any).ethereum;
  if (!eth?.request) return;
  try {
    const accounts = (await eth.request({ method: "eth_accounts" })) as string[];
    if (!Array.isArray(accounts) || accounts.length === 0) return;
    const expected = expectedAddress.toLowerCase();
    const active = accounts.map((a) => String(a).toLowerCase());
    if (!active.includes(expected)) {
      throw new WalletVerificationRejectedError(
        "Your active wallet changed before signing. Reconnect the wallet shown in FlowBridge, then try again.",
      );
    }
  } catch (err) {
    if (err instanceof WalletVerificationRejectedError) throw err;
    // Some in-app wallets block eth_accounts until an explicit connect. Do not
    // fail verification just because the readiness probe is unavailable.
  }
}

function withTimeout<T>(promise: Promise<T>, ms = SIGNATURE_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("No wallet signature received. Unlock your wallet, approve the signature prompt, then try again.")),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function signMessageWithActiveWallet(
  address: string,
  message: string,
  wagmiSignMessageAsync?: (args: { message: string; account?: `0x${string}` }) => Promise<string>,
): Promise<string> {
  const normalized = address.toLowerCase();
  await assertActiveInjectedAccount(normalized);

  const eth = typeof window !== "undefined" ? (window as any).ethereum : null;
  if (eth?.request) {
    try {
      const signature = await withTimeout(
        eth.request({ method: "personal_sign", params: [message, normalized] }) as Promise<string>,
      );
      await assertActiveInjectedAccount(normalized);
      if (!signature || typeof signature !== "string") throw new Error("Empty wallet signature");
      return signature;
    } catch (err: any) {
      throw new WalletVerificationRejectedError(getWalletSignatureErrorMessage(err));
    }
  }

  if (wagmiSignMessageAsync) {
    try {
      const signature = await withTimeout(wagmiSignMessageAsync({ message }));
      await assertActiveInjectedAccount(normalized);
      if (!signature || typeof signature !== "string") throw new Error("Empty wallet signature");
      return signature;
    } catch (err: any) {
      throw new WalletVerificationRejectedError(getWalletSignatureErrorMessage(err));
    }
  }

  throw new WalletVerificationRejectedError("No signing wallet provider was found. Open FlowBridge in your wallet browser or reconnect a signing wallet.");
}

/**
 * Ensure the given wallet address has proved key control this session.
 * Skips the round-trip if already verified. Throws on rejection/failure so
 * callers can abort the swap/bridge before writing a transaction.
 */
export async function ensureWalletVerified(
  address: string,
  signMessageAsync: (args: { message: string; account?: `0x${string}` }) => Promise<string>,
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
  // Do NOT pin `account` on the signMessage call: after switching wallets the
  // active connector may not hold the previous address, and wagmi will hang
  // forever waiting for a signer that isn't there. Let wagmi use the active
  // connector, and add a hard timeout so the UI can never lock up.
  let signature: string;
  try {
    signature = await signMessageWithActiveWallet(normalized, message, signMessageAsync);
  } catch (err: any) {
    if (err instanceof WalletVerificationRejectedError) throw err;
    throw new WalletVerificationRejectedError(getWalletSignatureErrorMessage(err));
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
