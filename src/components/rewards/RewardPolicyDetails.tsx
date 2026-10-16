import { useRewardPolicy } from '@/lib/rewards/useRewardPolicy';

const f = (n: number) => n.toLocaleString('en-US');
export function RewardPolicyDetails() {
  const { data: p, isPending, isError } = useRewardPolicy();
  return <section id="how" className="space-y-3 border-t border-hairline py-5" data-testid="reward-policy">
    <h2 className="text-lg font-bold">How you earn</h2>
    {!p ? <p role="status" className="text-sm text-muted">{isPending ? 'Checking approved reward rules…' : isError ? 'Reward rules could not be verified. Please try again.' : 'Reward rules unavailable.'}</p> : <>
      <p className="text-sm leading-relaxed">Qualifying verified swaps of ${f(p.minSwapUsd)} or more earn 1 Point per whole verified USD, up to {f(p.dailyCoreSwapCap)} PTS per wallet per UTC day.</p>
      <p className="text-sm leading-relaxed">Eligible new signup: <strong>{f(p.signupPoints)} PTS</strong>. Eligible referrer signup: <strong>{f(p.referrerSignupPoints)} PTS</strong>.</p>
      <details className="text-sm"><summary className="cursor-pointer font-semibold">Eligibility and referral limits</summary>
        <div className="mt-3 space-y-3 leading-relaxed text-muted">
          <p>Signup accounts must be created from {new Date(p.signupEffectiveAt).toLocaleString('en-US', { timeZone: 'UTC' })} UTC, verify their email and bind a wallet never previously awarded a signup bonus. The recorded award wallet must still match. Self-referrals, duplicate awards and review-held rewards do not qualify.</p>
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2">
            <dt>First qualifying swap (${f(p.minSwapUsd)}+)</dt><dd>{f(p.referralMilestoneFirstSwap)} PTS</dd>
            <dt>${f(p.referralMilestoneVolumeUsd)} verified volume</dt><dd>{f(p.referralMilestoneVolume)} PTS</dd>
            <dt>{f(p.referralMilestoneActiveDays)} qualifying UTC days</dt><dd>{f(p.referralMilestoneActiveDaysPoints)} PTS</dd>
            <dt>Milestone limit per referral</dt><dd>{f(p.referralMaxPerReferredUser)} PTS</dd>
            <dt>Rewarded milestone referrals / month</dt><dd>{f(p.referralMonthlyCap)}</dd>
            <dt>Rewarded signup referrals / month</dt><dd>{f(p.signupMonthlyCap)}</dd>
          </dl>
          <p>Signup and milestone monthly caps are checked against recorded rewards by the program. Rewards require canonical evidence, verification, review clearance and confirmed funding. Budget reservations are not paid FLOW.</p>
          <p>Historical rewards are preserved, not retroactively converted. Campaign PTS and XP never automatically convert to FLOW. Bridging does not earn core FLOW Points. Staking rewards are separate and paid by the staking contracts.</p>
        </div>
      </details>
      <details className="text-sm"><summary className="cursor-pointer font-semibold">When can I claim?</summary><ol className="mt-3 list-decimal space-y-2 pl-5 leading-relaxed text-muted">
        <li>Earn verified, eligible and funded rewards.</li>
        <li>Reach {f(p.settlementMinimum)} funded Points not already allocated.</li>
        <li>Wait for your funded allocation to be published in an on-chain payout round.</li>
        <li>Wait until the verified claim window opens.</li>
        <li>Claim with the allocated, authorized wallet on BOT Mainnet (677).</li>
      </ol><p className="mt-3 text-muted">A recorded Points total alone never unlocks claiming. Unrelated missions and community follows are not claim requirements.</p></details>
    </>}
  </section>;
}