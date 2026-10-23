import { isAllowedBindingHost } from './bindingMessage';
export interface SignInMessageFields { address: string; nonce: string; domain: string; uri: string; chainId: number; issuedAt: string; }
export function buildSignInMessage(f: SignInMessageFields, compact = false) {
  if (compact) return ['FlowBridge sign-in', `Wallet: ${f.address}`, `Chain: ${f.chainId}`, `Nonce: ${f.nonce}`, `Domain: ${f.domain}`, `URI: ${f.uri}`, `Issued At: ${f.issuedAt}`, 'Free signature. No transaction.'].join('\n');
  return [`${f.domain} wants you to sign in with your Ethereum account:`, f.address, '', 'Sign in to FlowBridge to link your wallet to your account. This signature is gasless and proves you control this wallet.', '', `URI: ${f.uri}`, 'Version: 1', `Chain ID: ${f.chainId}`, `Nonce: ${f.nonce}`, `Issued At: ${f.issuedAt}`].join('\n');
}
export function validateSignInMessage(message: string, expected: { wallet: string; nonce: string; requestOrigin: string | null; nowMs: number }): boolean {
  if (!expected.requestOrigin) return false;
  let uri: URL;
  try { uri = new URL(expected.requestOrigin); } catch { return false; }
  if (!isAllowedBindingHost(uri.host) || uri.origin !== expected.requestOrigin) return false;
  const compact = message.startsWith('FlowBridge sign-in\n');
  const get = (field: string) => message.match(new RegExp(`^${field}: (.+)$`, 'm'))?.[1];
  const chainId = Number(get(compact ? 'Chain' : 'Chain ID'));
  const issuedAt = get('Issued At');
  if (!issuedAt || !Number.isSafeInteger(chainId) || chainId <= 0) return false;
  const issued = Date.parse(issuedAt);
  if (!Number.isFinite(issued) || issued > expected.nowMs + 60000 || issued < expected.nowMs - 300000) return false;
  return message === buildSignInMessage({ address: expected.wallet.toLowerCase(), nonce: expected.nonce, domain: uri.host, uri: uri.origin, chainId, issuedAt }, compact);
}