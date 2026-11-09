import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SignInButton } from '@/components/auth/SignInButton';
import { useAccountData } from '@/lib/app/useAccountData';
import { refreshRewards } from '@/lib/rewards/useVaultV2Balance';
import { RewardProgressPanel } from './RewardProgressPanel';
import { ReferralRewards } from './ReferralRewards';
import { RewardPolicyDetails } from './RewardPolicyDetails';
import { BindWalletCard } from './BindWalletCard';
import { MainnetFlowClaimCard } from './MainnetFlowClaimCard';
import { FlowRewardsVaultV2Panel } from './FlowRewardsVaultV2Panel';
import { RewardsSummaryCard, useUnifiedRewards } from './RewardsSummaryCard';

export function RewardsExperience() {
  const { user, authReady, incentives, loading, refresh } = useAccountData();
  const { personal, loading: progressLoading, totals } = useUnifiedRewards();
  const [tab, setTab] = useState('rewards');
  useEffect(() => {
    const hash = window.location.hash.toLowerCase();
    if (hash === '#referrals') setTab('referrals');
    else if (['#earn','#how','#social','#social-tasks'].includes(hash)) setTab('policy');
  }, []);
  const retry = () => { void refresh(); window.dispatchEvent(new Event('flowbridge:wallet-bound')); refreshRewards(); };
  return <div className="min-w-0 space-y-5" data-testid="unified-rewards">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase text-primary">FlowBridge</p><h1 className="text-2xl font-bold">FLOW Rewards</h1></div><Button variant="ghost" size="icon" aria-label="Refresh rewards" title="Refresh rewards" onClick={retry}><RefreshCw className={loading || progressLoading ? 'animate-spin' : ''} /></Button></div>
    {!authReady ? <p role="status" className="text-sm text-muted">Checking your account…</p> : !user ? <div className="space-y-3"><p className="text-sm leading-relaxed text-muted">Sign in to see your Points and FLOW ready to claim. Points are not a token balance.</p><SignInButton label="Sign in" returnTo="/rewards" /></div> : <>
      <RewardsSummaryCard />
      <FlowRewardsVaultV2Panel />
      <BindWalletCard signedIn={!!user} boundAddress={incentives?.walletAddress} onDone={retry} />
      <details className="border-t border-hairline pt-3" open={totals.v1ClaimableFlow > 0}>
        <summary className="cursor-pointer text-sm font-semibold">Previous reward rounds{totals.v1ClaimableFlow > 0 ? ` · ${totals.v1ClaimableFlow.toLocaleString('en-US')} FLOW to claim` : ''}</summary>
        <div className="mt-3"><MainnetFlowClaimCard /></div>
      </details>
      <nav aria-label="Rewards views" className="flex flex-wrap gap-1 border-b border-hairline pb-2">{[['rewards','Details'],['referrals','Referrals'],['policy','How you earn']].map(([key,label]) => <Button key={key} variant={tab === key ? 'secondary' : 'ghost'} size="sm" onClick={() => setTab(key)} aria-pressed={tab === key}>{label}</Button>)}</nav>
      {tab === 'rewards' && (personal ? <RewardProgressPanel p={personal.progression} area="flow_points" detailed /> : <p role="status" className="text-sm text-muted">{progressLoading ? 'Checking verified reward eligibility…' : 'Reward status is unavailable. Refresh to retry; no claim amount is assumed.'}</p>)}
      {tab === 'referrals' && <ReferralRewards incentives={incentives} />}
    </>}
    {(tab === 'policy' || !user) && <RewardPolicyDetails />}
  </div>;
}
