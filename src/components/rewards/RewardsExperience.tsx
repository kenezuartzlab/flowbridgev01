import { useEffect, useState } from 'react';
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
import { MainnetFlowClaimCard } from './MainnetFlowClaimCard';

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
    <MainnetFlowClaimCard />
    {!authReady ? <p role="status" className="text-sm text-muted">Checking your account…</p> : !user ? <div className="space-y-3"><p className="text-sm leading-relaxed text-muted">Sign in to see recorded Points, funded rewards and verified payout eligibility. Points are not a token balance.</p><SignInButton label="Sign in" returnTo="/rewards" /></div> : <>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3" data-testid="reward-balances">
        {[
          [personal?.progression.reconciliationBlocked ? 'Funded · reconciliation held' : 'Earned Points · funded', Math.max(0, (summary?.eligibleFundedUnallocated ?? 0) - (personal?.payoutApproval?.awaitingApproval ?? 0)), 'PTS'],
          ['Awaiting Approval', personal?.payoutApproval?.awaitingApproval ?? 0, 'PTS'],
          ['Awaiting funding', summary?.pendingFunding, 'PTS'],
          ['Approved · awaiting publisher signature', personal?.payoutApproval?.awaitingPublicationFlow ?? 0, 'FLOW'],
          ['Published · claim opens soon', personal?.payoutApproval?.publishedWaitingFlow ?? 0, 'FLOW'],
          ['FLOW ready to claim', summary?.claimableNow, 'FLOW'],
          ['Claimed FLOW', summary?.claimedLifetime, 'FLOW'],
          ['Held for review', summary?.pendingReview, 'PTS'],
        ].map(([label,value,unit]) => <div key={String(label)} className="min-w-0"><dt className="text-xs leading-relaxed text-muted">{label}</dt><dd className="break-words text-xl font-bold tabular-nums">{typeof value === 'number' ? value.toLocaleString('en-US') : '—'} <span className="text-xs font-semibold text-muted">{unit}</span></dd></div>)}
      </dl>
      {personal && <div className="space-y-1 border-t border-hairline pt-3 text-sm text-muted" aria-label="Pending rewards by program">
        {(personal.progression.pendingFundingByProgram?.CORE_SWAP ?? 0) > 0 && <p><strong className="text-foreground">Mainnet swaps: {personal.progression.pendingFundingByProgram?.CORE_SWAP} PTS</strong> — verified earnings; Ops must confirm CORE_SWAP program backing and reserve funding before payout.</p>}
        {(personal.progression.pendingFundingByProgram?.REFERRAL_MILESTONE ?? 0) > 0 && <p>Referral milestones: {personal.progression.pendingFundingByProgram?.REFERRAL_MILESTONE} PTS — verified but awaiting separate program funding.</p>}
        {personal.progression.reconciliationBlocked && (personal.progression.sources.SIGNUP_BONUS ?? 0) > 0 && <p><strong className="text-foreground">Signup / referral signup: {personal.progression.sources.SIGNUP_BONUS} PTS reserved</strong> — {personal.progression.availableTowardMinimum} PTS remain after published allocations; account reconciliation is held. No new payout approval can clear this evidence hold.</p>}
        {(personal.progression.reconciliationEvidence?.unsupportedStored ?? 0) > 0 && <p>Historical record without qualifying evidence: {personal.progression.reconciliationEvidence?.unsupportedStored} PTS — excluded, not claimable.</p>}
        {(personal.progression.reconciliationEvidence?.provenanceHeld ?? 0) > 0 && <p>Mainnet swap evidence held: {personal.progression.reconciliationEvidence?.provenanceHeld} PTS — excluded until original transaction and earning evidence passes; not awaiting funding alone.</p>}
        {(personal.progression.reconciliationEvidence?.unresolvedReview ?? 0) > 0 && <p>Other earning evidence unresolved: {personal.progression.reconciliationEvidence?.unresolvedReview} PTS — excluded from verified funding candidates.</p>}
      </div>}
      {personal?.payoutApproval?.claimOpensAt && <p role="status" className="text-sm text-muted">Your published FLOW can be claimed from {new Date(personal.payoutApproval.claimOpensAt).toLocaleString()}.</p>}
      <Button asChild className="h-auto min-h-10 w-full whitespace-normal text-center"><a href="#mainnet-flow-claim">{(summary?.claimableNow ?? 0) > 0 ? 'Claim available FLOW' : 'Check FLOW ready to claim'}</a></Button>
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