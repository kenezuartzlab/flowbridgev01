import { useAccountData } from '@/lib/app/useAccountData';
import { usePersonalProgress } from '@/lib/rewards/usePersonalProgress';
import { rewardPresentation } from '@/lib/rewards/rewardPresentation';
import { unifiedRewardTotals } from '@/lib/rewards/unifiedRewards';
import { useVaultV2Balance } from '@/lib/rewards/useVaultV2Balance';

/** Shared four-figure rewards summary. Same numbers on Home, Earn and Rewards. */
export function useUnifiedRewards() {
  const { user, incentives } = useAccountData();
  const { data: personal, loading } = usePersonalProgress(!!user);
  const v2 = useVaultV2Balance(incentives?.walletAddress);
  const summary = rewardPresentation(personal?.progression).summary;
  return { personal, loading, totals: unifiedRewardTotals(summary, v2.figures, v2.enabled, !!personal?.progression.reconciliationBlocked) };
}

const n = (v: number | null) => (v === null ? '—' : v.toLocaleString('en-US'));

export function RewardsSummaryCard() {
  const { totals, loading } = useUnifiedRewards();
  const rows: [string, string, string, string?][] = [
    ['Available Points', totals.availablePts === null ? (loading ? '—' : 'Under verification') : n(totals.availablePts), totals.availablePts === null ? '' : 'PTS', 'Verified, funded, not yet in a payout'],
    ['Total Points earned', n(totals.earnedPts), 'PTS', 'Lifetime — not a token balance'],
    ['FLOW ready to claim', n(totals.claimableFlow), 'FLOW'],
    ['FLOW claimed', n(totals.claimedFlow), 'FLOW', 'All rounds, verified on chain'],
  ];
  return <div className="space-y-2">
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3" data-testid="reward-balances">
      {rows.map(([label, value, unit, hint]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted">{label}</dt><dd className="break-words text-xl font-bold tabular-nums">{value} {unit && <span className="text-xs font-semibold text-muted">{unit}</span>}</dd>{hint && <p className="text-[11px] leading-snug text-muted">{hint}</p>}</div>)}
    </dl>
    {(totals.pendingFundingPts > 0 || totals.heldPts > 0 || totals.reconciliationHeldPts > 0) && <p className="text-xs text-muted">{totals.reconciliationHeldPts > 0 && <>{totals.reconciliationHeldPts.toLocaleString('en-US')} PTS funded, held for account review. </>}{totals.pendingFundingPts > 0 && <>{totals.pendingFundingPts.toLocaleString('en-US')} PTS awaiting funding. </>}{totals.heldPts > 0 && <>{totals.heldPts.toLocaleString('en-US')} PTS held for review.</>}</p>}
  </div>;
}
