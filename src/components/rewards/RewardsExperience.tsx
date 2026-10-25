import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SignInButton } from '@/components/auth/SignInButton';
import { useAccountData } from '@/lib/app/useAccountData';
import { usePersonalProgress } from '@/lib/rewards/usePersonalProgress';
import { rewardPresentation } from '@/lib/rewards/rewardPresentation';
import { RewardProgressPanel } from './RewardProgressPanel';
import { ReferralRewards } from './ReferralRewards';
import { RewardPolicyDetails } from './RewardPolicyDetails';
import { BindWalletCard } from './BindWalletCard';

export function RewardsExperience() {
  const { user, authReady, incentives, loading, refresh } = useAccountData();
  const { data: personal, loading: progressLoading } = usePersonalProgress(!!user);
  const [tab, setTab] = useState('rewards');
  useEffect(() => {
    const hash = window.location.hash.toLowerCase();
    if (hash === '#referrals') setTab('referrals');
    else if (['#earn','#how','#social','#social-tasks'].includes(hash)) setTab('policy');
  }, []);
  const summary = rewardPresentation(personal?.progression).summary;
  const retry = () => { void refresh(); window.dispatchEvent(new Event('flowbridge:wallet-bound')); };
  return <div className="min-w-0 space-y-5" data-testid="unified-rewards">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase text-primary">FlowBridge</p><h1 className="text-2xl font-bold">FLOW Rewards</h1></div><Button variant="ghost" size="icon" aria-label="Refresh rewards" title="Refresh rewards" onClick={retry}><RefreshCw className={loading || progressLoading ? 'animate-spin' : ''} /></Button></div>
    {!authReady ? <p role="status" className="text-sm text-muted">Checking your account…</p> : !user ? <div className="space-y-3"><p className="text-sm leading-relaxed text-muted">Sign in to see recorded Points, funded rewards and verified payout eligibility. Points are not a token balance.</p><SignInButton label="Sign in" returnTo="/rewards" /></div> : <>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3" data-testid="reward-balances">
        {[
          ['Available Points', Math.max(0, (summary?.eligibleFundedUnallocated ?? 0) - (personal?.payoutApproval?.awaitingApproval ?? 0)), 'PTS'],
          ['Awaiting Approval', personal?.payoutApproval?.awaitingApproval ?? 0, 'PTS'],
          ['Approved FLOW', personal?.payoutApproval?.approvedFlow ?? 0, 'FLOW'],
          ['Claimable FLOW', summary?.claimableNow, 'FLOW'],
          ['Awaiting funding', summary?.pendingFunding, 'PTS'],
          ['Held for review', summary?.pendingReview, 'PTS'],
        ].map(([label,value,unit]) => <div key={String(label)} className="min-w-0"><dt className="text-xs leading-relaxed text-muted">{label}</dt><dd className="break-words text-xl font-bold tabular-nums">{typeof value === 'number' ? value.toLocaleString('en-US') : '—'} <span className="text-xs font-semibold text-muted">{unit}</span></dd></div>)}
      </dl>
      <Button asChild className="h-auto min-h-10 w-full whitespace-normal text-center"><Link to="/earn">{(summary?.claimableNow ?? 0) > 0 ? 'View verified claim' : 'View payout status'}</Link></Button>
      <nav aria-label="Rewards views" className="flex flex-wrap gap-1 border-b border-hairline pb-2">{[['rewards','Points & eligibility'],['referrals','Referrals'],['policy','How you earn']].map(([key,label]) => <Button key={key} variant={tab === key ? 'secondary' : 'ghost'} size="sm" onClick={() => setTab(key)} aria-pressed={tab === key}>{label}</Button>)}</nav>
      {tab === 'rewards' && <>
        {personal ? <RewardProgressPanel p={personal.progression} area="flow_points" detailed /> : <p role="status" className="text-sm text-muted">{progressLoading ? 'Checking verified reward eligibility…' : 'Reward status is unavailable. Refresh to retry; no claim amount is assumed.'}</p>}
        <BindWalletCard signedIn={!!user} boundAddress={incentives?.walletAddress} onDone={retry} />
      </>}
      {tab === 'referrals' && <ReferralRewards incentives={incentives} />}
    </>}
    {(tab === 'policy' || !user) && <RewardPolicyDetails />}
  </div>;
}