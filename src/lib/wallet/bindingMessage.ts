/**
 * V34.2 — human-readable wallet-binding ownership message (pure).
 * The server re-parses and validates every field; the browser never decides.
 */
export const BINDING_PURPOSE = "WALLET_BINDING";
export const BINDING_TTL_MS = 5 * 60 * 1000;
export const MAX_BINDING_HOST_LENGTH = 253;
export const MAX_BINDING_MESSAGE_LENGTH = 4096;

export const ALLOWED_BINDING_HOSTS = [
  "flowbridge.space",
  "www.flowbridge.space",
  "notify.flowbridge.space",
  "flowbridgev01.lovable.app",
];

export function isAllowedBindingHost(host: string): boolean {
  if (typeof host !== "string" || host.length === 0 || host.length > MAX_BINDING_HOST_LENGTH) return false;
  const h = host.toLowerCase();
  if (ALLOWED_BINDING_HOSTS.includes(h)) return true;
  // The old nested repetition matched the same label language but could
  // backtrack exponentially. Check suffix and label independently instead.
  const previewSuffix = ".lovable.app";
  if (h.endsWith(previewSuffix)) return /^[a-z0-9-]+$/.test(h.slice(0, -previewSuffix.length));
  if (/^localhost(:\d+)?$/.test(h) || /^127\.0\.0\.1(:\d+)?$/.test(h)) return true;
  return false;
}

export interface BindingFields {
  domain: string;
  origin: string;
  account: string;
  wallet: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  purpose: string;
}

export function buildBindingMessage(f: Omit<BindingFields, "purpose">): string {
  return [
    "Sign this message to verify that you control this wallet and bind it to your FlowBridge account.",
    "",
    "This signature is free. It does not move funds. It does not approve tokens.",
    "",
    `Domain: ${f.domain}`,
    `Origin: ${f.origin}`,
    `Account: ${f.account}`,
    `Wallet: ${f.wallet.toLowerCase()}`,
    `Nonce: ${f.nonce}`,
    `Issued At: ${f.issuedAt}`,
    `Expires At: ${f.expiresAt}`,
    `Purpose: ${BINDING_PURPOSE}`,
  ].join("\n");
}

export function parseBindingMessage(message: string): BindingFields | null {
  if (typeof message !== "string" || message.length > MAX_BINDING_MESSAGE_LENGTH) return null;
  const get = (k: string) => {
    const m = message.match(new RegExp(`^${k}: (.+)$`, "m"));
    return m ? m[1].trim() : null;
  };
  const f = {
    domain: get("Domain"),
    origin: get("Origin"),
    account: get("Account"),
    wallet: get("Wallet"),
    nonce: get("Nonce"),
    issuedAt: get("Issued At"),
    expiresAt: get("Expires At"),
    purpose: get("Purpose"),
  };
  if (Object.values(f).some((v) => !v)) return null;
  return f as BindingFields;
}

export type BindingCheck = { ok: true } | { ok: false; error: string };

/** Validates the signed text against the server's view of the request. */
export function validateBindingMessage(
  message: string,
  expect: { userId: string; wallet: string; nonce: string; requestOrigin: string | null; nowMs: number },
): BindingCheck {
  if (typeof message !== "string" || message.length > MAX_BINDING_MESSAGE_LENGTH)
    return { ok: false, error: "Binding message is invalid or too long." };
  const f = parseBindingMessage(message);
  if (!f) return { ok: false, error: "Binding message is incomplete." };
  // Exact canonical text: any modification of the human-readable part is rejected.
  if (buildBindingMessage(f) !== message) return { ok: false, error: "Binding message was modified." };
  if (f.purpose !== BINDING_PURPOSE) return { ok: false, error: "Wrong signature purpose." };
  if (!isAllowedBindingHost(f.domain)) return { ok: false, error: "Wrong domain." };
  let originHost = "";
  try {
    originHost = new URL(f.origin).host;
  } catch {
    return { ok: false, error: "Wrong origin." };
  }
  if (originHost !== f.domain) return { ok: false, error: "Wrong origin." };
  if (!expect.requestOrigin || expect.requestOrigin !== f.origin) return { ok: false, error: "Wrong origin." };
  if (f.account !== expect.userId) return { ok: false, error: "Signed for a different account." };
  if (f.wallet !== expect.wallet.toLowerCase()) return { ok: false, error: "Signed for a different wallet." };
  if (f.nonce !== expect.nonce) return { ok: false, error: "Nonce mismatch." };
  const exp = Date.parse(f.expiresAt);
  const iss = Date.parse(f.issuedAt);
  if (!Number.isFinite(exp) || !Number.isFinite(iss)) return { ok: false, error: "Invalid timestamps." };
  if (exp < expect.nowMs) return { ok: false, error: "Binding request expired." };
  if (exp - iss > BINDING_TTL_MS + 60_000 || iss > expect.nowMs + 60_000)
    return { ok: false, error: "Invalid timestamps." };
  return { ok: true };
}
