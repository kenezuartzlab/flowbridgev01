/** V34 — verified reward progression on Profile. No email, wallet or evidence shown. */
import { usePersonalProgress } from "@/lib/rewards/usePersonalProgress";
import { rewardPresentation } from '@/lib/rewards/rewardPresentation';

const f = (n: number) => Math.floor(n).toLocaleString("en-US");

export function ProfileRewardProgression({ enabled }: { enabled: boolean }) {
  const { data } = usePersonalProgress(enabled);
  if (!data) return null;
  const p = data.progression;
  const s = rewardPresentation(p).summary;
  if (!s) return null;
  const rows: [string, number][] = [
    ["Recorded FLOW Points", s.totalPts],
    ["Eligible toward next payout", s.eligibleFundedUnallocated],
    ["Awaiting funding Points", s.pendingFunding],
    ["Claimable FLOW now", s.claimableNow],
    ["Claimed FLOW on-chain", s.claimedLifetime],
  ];
  return (
    <section aria-labelledby="profile-rp" className="fb-surface p-4" data-testid="profile-reward-progression">
      <h2 id="profile-rp" className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-primary">Reward progression</h2>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="text-right font-semibold tabular-nums">{f(v)}</dd></div>
        ))}
      </dl>
      <p className="mt-2 text-[11px] text-muted">{s.message}</p>
    </section>
  );
}
