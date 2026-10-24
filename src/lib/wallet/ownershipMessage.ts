import { isAllowedBindingHost } from './bindingMessage';

export const OWNERSHIP_PURPOSE = 'TRADING_OWNERSHIP';
export const OWNERSHIP_TTL_MS = 300_000;
export const OWNERSHIP_CHAINS = [677, 968, 56, 97, 1, 11155111] as const;
export interface OwnershipFields {
  address: string;
  nonce: string;
  domain: string;
  uri: string;
  chainId: number;
  issuedAt: string;
}

export function buildOwnershipMessage(f: OwnershipFields, compact = false): string {
  return [
    compact ? 'FlowBridge wallet check' : 'FlowBridge wallet ownership verification',
    'Prove control of this wallet only. This does not sign in, bind an account, approve tokens or authorize a transaction.',
    `Wallet: ${f.address.toLowerCase()}`,
    `Domain: ${f.domain}`,
    `URI: ${f.uri}`,
    `Chain ID: ${f.chainId}`,
    `Nonce: ${f.nonce}`,
    `Issued At: ${f.issuedAt}`,
    `Purpose: ${OWNERSHIP_PURPOSE}`,
    'Free signature. No transaction.',
  ].join('\n');
}

export function validateOwnershipMessage(message: string, expected: {
  wallet: string; nonce: string; chainId: number; requestOrigin: string | null; nowMs: number;
}): boolean {
  if (!expected.requestOrigin || !OWNERSHIP_CHAINS.some(chain => chain === expected.chainId)) return false;
  let origin: URL;
  try { origin = new URL(expected.requestOrigin); } catch { return false; }
  if (!isAllowedBindingHost(origin.host) || origin.origin !== expected.requestOrigin) return false;
  if (origin.protocol !== 'https:' && !/^localhost$|^127\.0\.0\.1$/.test(origin.hostname)) return false;
  if (!/^0x[a-fA-F0-9]{40}$/.test(expected.wallet) || !/^[a-f0-9]{48}$/.test(expected.nonce)) return false;
  const issuedAt = message.match(/^Issued At: (.+)$/m)?.[1];
  if (!issuedAt) return false;
  const issued = Date.parse(issuedAt);
  if (!Number.isFinite(issued) || issued > expected.nowMs + 60_000 || issued < expected.nowMs - OWNERSHIP_TTL_MS) return false;
  return message === buildOwnershipMessage({ address: expected.wallet, nonce: expected.nonce,
    domain: origin.host, uri: origin.origin, chainId: expected.chainId, issuedAt }, message.startsWith('FlowBridge wallet check\n'));
}