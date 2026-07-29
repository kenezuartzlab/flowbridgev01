// SIWE-based ownership gate. Before a wallet can execute its first swap or
// bridge in a session, it must produce a signature over a fresh server-issued
// nonce. Watch-only wallets cannot sign, so they are stopped before signing
// any state-changing transaction. Verification is cached per-address in
// localStorage so a refresh does not force another signature. The cache is
// explicitly cleared when the user disconnects or switches wallets.

import { isInAppBrowser, isTokenPocketBrowser } from "@/lib/in-app-browser";
import { buildFlowBridgeTypedData } from "@/lib/siweProof";

const STORAGE_PREFIX = "flowbridge:wallet-verified:";
const SIGNATURE_TIMEOUT_MS = 45_000;
// TokenPocket's in-app prompt often sits behind its own "Waiting" overlay for a
// while (network/keystore unlock). Give the user real time to tap Confirm
// instead of abandoning the request underneath them.
const TOKENPOCKET_SIGNATURE_TIMEOUT_MS = 180_000;

// A single in-flight signature request per address. TokenPocket deadlocks (its
// prompt freezes on "Waiting") as soon as a second personal_sign arrives while
// the first is still pending — which happens when the connect modal and the
// swap guard both ask, or when the user taps twice. Re-use the live request.
const inFlightSignatures = new Map<string, { message: string; promise: Promise<string> }>();

export function hasWalletSignatureInFlight(address?: string | null): boolean {
  if (!address) return inFlightSignatures.size > 0;
  return inFlightSignatures.has(address.toLowerCase());
}

function dedupeSignature(
  address: string,
  message: string,
  run: () => Promise<string>,
): Promise<string> {
  const key = address.toLowerCase();
  const globalExisting = Array.from(inFlightSignatures.entries())[0];
  const existing = inFlightSignatures.get(key);
  // Identical request already open in the wallet → attach to it, never prompt twice.
  if (existing && existing.message === message) return existing.promise;

  if (globalExisting) {
    throw new WalletVerificationRejectedError(
      "A wallet signature request is already open. Finish or close the wallet prompt first, then tap retry.",
    );
  }

  // Different message while the wallet prompt is open: do not queue a second
  // prompt. TokenPocket can keep its Confirm button behind a permanent
  // "Waiting" layer when a later SIWE nonce is queued before the first prompt
  // finishes. Let the user finish or close the current wallet sheet first.
  if (existing) {
    throw new WalletVerificationRejectedError(
      "A wallet signature request is already open. Finish or close the wallet prompt first, then tap retry.",
    );
  }

  const start = run();
  const entry = {
    message,
    promise: start.finally(() => {
      if (inFlightSignatures.get(key) === entry) inFlightSignatures.delete(key);
    }),
  };
  inFlightSignatures.set(key, entry);
  return entry.promise;
}



function storageKey(address: string) {
  return `${STORAGE_PREFIX}${address.toLowerCase()}`;
}

export function isWalletVerified(address: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(address)) === "1";
  } catch {
    return false;
  }
}

export function clearWalletVerified(address: string): void {
  try {
    window.localStorage.removeItem(storageKey(address));
  } catch {
    /* ignore */
  }
}

export function markWalletVerified(address: string): void {
  try {
    window.localStorage.setItem(storageKey(address), "1");
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
    return "A wallet signature request is already open. Finish or close the wallet prompt first, then tap retry.";
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

function shouldFallbackToInjected(err: any) {
  const msg = String(err?.shortMessage || err?.details || err?.message || err || "");
  const code = Number(err?.code ?? err?.cause?.code);
  return (
    code === -32601 ||
    code === -32004 ||
    // Some in-app wallets (TokenPocket) accept the wagmi request but never
    // resolve it. Treat a silent timeout as "try the injected provider next"
    // instead of reporting a rejection the user never made.
    /timed out|timeout|no wallet signature/i.test(msg) ||
    /connector.*not.*connected|provider.*not.*found|method.*not.*found|method.*not.*supported|unsupported/i.test(msg)
  );
}

function shouldFallbackFromTypedData(err: any) {
  const msg = String(err?.shortMessage || err?.details || err?.message || err || "");
  const code = Number(err?.code ?? err?.cause?.code);
  return (
    code === -32601 ||
    code === -32004 ||
    /method.*not.*found|method.*not.*supported|unsupported|unknown.*method|not implemented/i.test(msg)
  );
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

function extractNonceFromMessage(message: string): string {
  const match = message.match(/Nonce:\s*([^\s]+)/i);
  const nonce = match?.[1]?.trim();
  if (!nonce) {
    throw new WalletVerificationRejectedError("Could not prepare the wallet signature. Close the wallet prompt and try again.");
  }
  return nonce;
}

function normalizeSignatureResult(result: any): string {
  const signature = typeof result === "string" ? result : result?.result;
  if (!signature || typeof signature !== "string") throw new Error("Empty wallet signature");
  return signature;
}

async function requestProviderSignature(args: {
  method: string;
  params: unknown[];
  ms: number;
  preferCallback?: boolean;
}): Promise<string> {
  const eth = typeof window !== "undefined" ? (window as any).ethereum : null;
  if (!eth) throw new Error("provider not found");

  if (args.preferCallback && typeof eth.sendAsync === "function") {
    const signature = await withTimeout(
      new Promise<string>((resolve, reject) => {
        eth.sendAsync(
          {
            id: Date.now(),
            jsonrpc: "2.0",
            method: args.method,
            params: args.params,
          },
          (error: any, response: any) => {
            if (error) {
              reject(error);
              return;
            }
            if (response?.error) {
              reject(response.error);
              return;
            }
            try {
              resolve(normalizeSignatureResult(response));
            } catch (err) {
              reject(err);
            }
          },
        );
      }),
      args.ms,
    );
    return signature;
  }

  if (!eth.request) throw new Error("provider not found");
  return normalizeSignatureResult(
    await withTimeout(
      eth.request({ method: args.method, params: args.params }) as Promise<unknown>,
      args.ms,
    ),
  );
}

function stringToHex(value: string): `0x${string}` {
  const bytes = new TextEncoder().encode(value);
  return `0x${Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

async function signWithInjected(normalized: string, message: string, ms?: number): Promise<string> {
  const eth = typeof window !== "undefined" ? (window as any).ethereum : null;
  if (!eth?.request) throw new Error("provider not found");
  const tokenPocket = isTokenPocketBrowser();
  // TokenPocket's mobile in-app provider is more reliable when personal_sign
  // receives UTF-8 data as hex bytes. Other wallets keep the existing raw text
  // path that has been stable in Bitget, OKX, MetaMask, etc.
  const signableMessage = tokenPocket ? stringToHex(message) : message;
  const signature = (await withTimeout(
    eth.request({ method: "personal_sign", params: [signableMessage, normalized] }) as Promise<string>,
    ms ?? (tokenPocket ? TOKENPOCKET_SIGNATURE_TIMEOUT_MS : SIGNATURE_TIMEOUT_MS),
  )) as string;
  await assertActiveInjectedAccount(normalized);
  if (!signature || typeof signature !== "string") throw new Error("Empty wallet signature");
  return signature;
}

async function signPersonalWithTokenPocket(normalized: string, message: string): Promise<string> {
  // TokenPocket is most stable with one injected personal_sign request and the
  // UTF-8 SIWE message encoded as hex. Use ethereum.request directly — some
  // TokenPocket builds expose sendAsync but never resolve its callback after
  // approval, which leaves FlowBridge waiting even though the wallet prompt was
  // accepted. Do not use typed-data here: some builds display raw JSON and keep
  // the dApp in a permanent waiting state.
  try {
    return await signWithInjected(normalized, message, TOKENPOCKET_SIGNATURE_TIMEOUT_MS);
  } catch (err: any) {
    throw new WalletVerificationRejectedError(getWalletSignatureErrorMessage(err));
  }
}

async function signTypedDataWithTokenPocket(normalized: string, message: string): Promise<string> {
  const nonce = extractNonceFromMessage(message);
  const typedData = buildFlowBridgeTypedData({
    walletAddress: normalized,
    message,
    nonce,
  });
  const params = [normalized, JSON.stringify(typedData)];

  try {
    const signature = await requestProviderSignature({
      method: "eth_signTypedData_v4",
      params,
      ms: TOKENPOCKET_SIGNATURE_TIMEOUT_MS,
      preferCallback: true,
    });
    await assertActiveInjectedAccount(normalized);
    return signature;
  } catch (err: any) {
    if (!shouldFallbackFromTypedData(err)) {
      throw new WalletVerificationRejectedError(getWalletSignatureErrorMessage(err));
    }
  }

  // Older TokenPocket builds may not expose typed-data signing. Only then do we
  // fall back to personal_sign; never open a second prompt after a timeout or a
  // user rejection, because TokenPocket can leave the first prompt pending.
  try {
    return await signWithInjected(normalized, message, TOKENPOCKET_SIGNATURE_TIMEOUT_MS);
  } catch (err: any) {
    throw new WalletVerificationRejectedError(getWalletSignatureErrorMessage(err));
  }
}

export async function signMessageWithActiveWallet(
  address: string,
  message: string,
  wagmiSignMessageAsync?: (args: { message: string; account?: `0x${string}` }) => Promise<string>,
): Promise<string> {
  return dedupeSignature(address, message, () =>
    signMessageWithActiveWalletInner(address, message, wagmiSignMessageAsync),
  );
}

async function signMessageWithActiveWalletInner(
  address: string,
  message: string,
  wagmiSignMessageAsync?: (args: { message: string; account?: `0x${string}` }) => Promise<string>,
): Promise<string> {
  const normalized = address.toLowerCase();
  await assertActiveInjectedAccount(normalized);


  const hasInjected = typeof window !== "undefined" && !!(window as any).ethereum?.request;
  const tokenPocket = isTokenPocketBrowser();
  if (tokenPocket && hasInjected) {
    return await signTypedDataWithTokenPocket(normalized, message);
  }
  // Inside wallet in-app browsers (TokenPocket, Bitget, Trust…) the injected
  // provider is the wallet itself and answers reliably. wagmi's connector layer
  // sometimes accepts the request there and never resolves it, so ask the
  // injected provider first and keep wagmi as the fallback.
  const injectedFirst = hasInjected && isInAppBrowser();

  if (injectedFirst) {
    try {
      return await signWithInjected(normalized, message, tokenPocket ? TOKENPOCKET_SIGNATURE_TIMEOUT_MS : undefined);
    } catch (err: any) {
      // TokenPocket often leaves connector-layer requests pending after an
      // injected-provider timeout. Do not open a second wallet prompt; surface a
      // clean retry message instead of leaving the UI stuck.
      if (tokenPocket) {
        throw new WalletVerificationRejectedError(getWalletSignatureErrorMessage(err));
      }
      if (!shouldFallbackToInjected(err) || !wagmiSignMessageAsync) {
        throw new WalletVerificationRejectedError(getWalletSignatureErrorMessage(err));
      }
    }
  }

  if (wagmiSignMessageAsync) {
    try {
      // Shorter window: if the connector goes silent we still have time to
      // retry through the injected provider before the user gives up.
      const signature = await withTimeout(wagmiSignMessageAsync({ message }), hasInjected ? 15_000 : SIGNATURE_TIMEOUT_MS);
      await assertActiveInjectedAccount(normalized);
      if (!signature || typeof signature !== "string") throw new Error("Empty wallet signature");
      return signature;
    } catch (err: any) {
      if (!shouldFallbackToInjected(err) || injectedFirst) {
        throw new WalletVerificationRejectedError(getWalletSignatureErrorMessage(err));
      }
    }
  }

  if (hasInjected) {
    try {
      return await signWithInjected(normalized, message);
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
const inFlightVerifications = new Map<string, Promise<void>>();

export async function ensureWalletVerified(
  address: string,
  signMessageAsync: (args: { message: string; account?: `0x${string}` }) => Promise<string>,
): Promise<void> {
  if (!address) throw new Error("Wallet address required for verification");
  const normalized = address.toLowerCase();
  if (isWalletVerified(normalized)) return;
  const running = inFlightVerifications.get(normalized);
  if (running) return running;
  const promise = ensureWalletVerifiedInner(normalized, signMessageAsync).finally(() => {
    if (inFlightVerifications.get(normalized) === promise) inFlightVerifications.delete(normalized);
  });
  inFlightVerifications.set(normalized, promise);
  return promise;
}

async function ensureWalletVerifiedInner(
  normalized: string,
  signMessageAsync: (args: { message: string; account?: `0x${string}` }) => Promise<string>,
): Promise<void> {


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

  markWalletVerified(normalized);
}
