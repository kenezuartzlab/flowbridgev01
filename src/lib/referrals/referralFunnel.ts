/**
 * V36.7 — privacy-safe referral funnel (pure). Counts only; never emails or
 * wallets. A permanent relationship is not an earned, funded or claimable reward.
 */
export interface FunnelReferee {
  emailVerified: boolean;
  walletBound: boolean;
  qualified: boolean;
  awaitingFunding: boolean;
  exclusionReason?: string | null;
}
export interface ReferralFunnel {
  totalInvited: number;
  signedUp: number;
  identityVerified: number;
  walletBound: number;
  rewardQualified: number;
  awaitingFunding: number;
  fundedEligible: number;
  excluded: Array<{ reason: string; count: number }>;
}
export function buildReferralFunnel(rows: FunnelReferee[]): ReferralFunnel {
  const excluded = new Map<string, number>();
  let fundedEligible = 0;
  let awaiting = 0;
  for (const r of rows) {
    if (r.exclusionReason) excluded.set(r.exclusionReason, (excluded.get(r.exclusionReason) ?? 0) + 1);
    else if (r.qualified && !r.awaitingFunding) fundedEligible++;
    else if (r.awaitingFunding) awaiting++;
  }
  return {
    totalInvited: rows.length,
    signedUp: rows.length,
    identityVerified: rows.filter((r) => r.emailVerified || r.walletBound).length,
    walletBound: rows.filter((r) => r.walletBound).length,
    rewardQualified: rows.filter((r) => r.qualified && !r.exclusionReason).length,
    awaitingFunding: awaiting,
    fundedEligible,
    excluded: [...excluded].map(([reason, count]) => ({ reason, count })),
  };
}
