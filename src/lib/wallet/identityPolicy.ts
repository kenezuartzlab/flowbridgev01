import { z } from 'zod';

export const recoveryRequest = z.object({
  userId: z.string().uuid(),
  targetWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  reason: z.string().trim().min(10).max(500),
  ownershipEvidence: z.string().trim().min(10).max(500),
  expiresAt: z.string().datetime(),
});
export function recoveryAvailable(grant: { target_wallet: string; expires_at: string; revoked_at: string | null; consumed_at: string | null } | null, wallet?: string, now = Date.now()) {
  return !!grant && !grant.revoked_at && !grant.consumed_at && Date.parse(grant.expires_at) > now && /^0x[a-fA-F0-9]{40}$/.test(wallet ?? '') && grant.target_wallet.toLowerCase() === wallet?.toLowerCase();
}
export function validRecoveryExpiry(expiry: string, now = Date.now()) {
  const t = Date.parse(expiry); return Number.isFinite(t) && t > now && t <= now + 24 * 60 * 60 * 1000;
}