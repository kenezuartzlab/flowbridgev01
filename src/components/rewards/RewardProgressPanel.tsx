/**
 * V34 — verified progress toward the 1,000 FLOW claim minimum. Render-only:
 * every number comes from the server progression; nothing is signed here.
 */
import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import type { RewardProgression } from "@/lib/rewards/rewardProgression";
import { trackProductEvent, type ProductArea } from "@/lib/ops/productEvents";

const f = (n: number) => Math.floor(n).toLocaleString("en-US");
const d = (s: number) => new Date(s * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

const SOURCE_LABEL = { CORE_SWAP: "Eligible swaps", SIGNUP_BONUS: "Funded signup reward", REFERRAL_MILESTONE: "Referral milestones", OTHER: "Other verified" } as const;

export function RewardProgressPanel({ p, area, detailed = false }: { p: RewardProgression; area: ProductArea; detailed?: boolean }) {
  useEffect(() => {
    trackProductEvent("reward_progress_viewed", area, { once: true });
    for (const t of p.thresholdsReached) trackProductEvent(`reward_threshold_${t}` as const, area, { once: true });
    if (p.settlementReady) trackProductEvent("settlement_eligible", area, { once: true });
    if (p.lifecycle === "ALLOCATED_ON_CHAIN") trackProductEvent("allocation_published", area, { once: true });
    if (p.lifecycle === "CLAIMABLE_NOW") trackProductEvent("claim_available", area, { once: true });
  }, [p, area]);

  const a = p.allocation;
  return (
    <section aria-labelledby={`rp-${area}`} className="fb-surface space-y-3 p-4" data-testid="reward-progress">
      <p id={`rp-${area}`} className="text-[10px] font-black uppercase tracking-[0.14em] text-primary">Progress to claim</p>
      <div>
        <p className="text-[18px] font-bold tabular-nums">{f(p.availableTowardMinimum)} / {f(p.minimum)} FLOW</p>
        <p className="text-[12px] text-muted">{p.remainingToMinimum > 0 ? `${f(p.remainingToMinimum)} FLOW remaining to minimum` : "Claim minimum reached"}</p>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted/20" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.percent} aria-label="Progress toward 1,000 FLOW">
        <div className="h-full rounded-full bg-primary motion-safe:transition-[width]" style={{ width: `${p.percent}%` }} />
      </div>
      <p className="text-[12px] font-semibold">{p.lifecycleLabel}</p>
      {a && !a.claimed && <p className="text-[11.5px] text-muted">Round #{a.epochId}: {f(a.amountFlow)} FLOW · window {d(a.claimStart)} – {d(a.claimEnd)}</p>}

      <div>
        <p className="mb-1 text-[10px] font-black uppercase tracking-[0.14em] text-muted">How you can progress</p>
        <ul className="space-y-1 text-[11.5px]">
          <li><Link to="/trade" onClick={() => trackProductEvent("earning_method_opened", area)} className="font-semibold text-primary underline-offset-2 hover:underline">Eligible swaps</Link> — verified BOT Mainnet swaps of $5+ through FlowBridge earn 1 point per $1.</li>
          <li><Link to="/account" onClick={() => trackProductEvent("earning_method_opened", area)} className="font-semibold text-primary underline-offset-2 hover:underline">Referral milestones</Link> — funded, only after your referee's verified Mainnet activity.</li>
        </ul>
      </div>

      {detailed && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-hairline pt-3 text-[11.5px]">
          {(Object.keys(SOURCE_LABEL) as (keyof typeof SOURCE_LABEL)[]).filter((k) => p.sources[k] > 0).map((k) => (
            <div key={k} className="contents"><dt className="text-muted">{SOURCE_LABEL[k]}</dt><dd className="text-right tabular-nums">{f(p.sources[k])}</dd></div>
          ))}
          <dt className="text-muted">Funded, eligible</dt><dd className="text-right tabular-nums">{f(p.eligibleFundedFlow)}</dd>
          <dt className="text-muted">Pending funding</dt><dd className="text-right tabular-nums">{f(p.pendingUnfunded)}</dd>
          <dt className="text-muted">Held for review</dt><dd className="text-right tabular-nums">{f(p.reviewHeld)}</dd>
          <dt className="text-muted">Not counted (Testnet / history)</dt><dd className="text-right tabular-nums">{f(p.testnetExcluded + p.historicalNonclaimable)}</dd>
          <dt className="text-muted">Settled in rounds</dt><dd className="text-right tabular-nums">{f(p.settledFlow)}</dd>
          <dt className="text-muted">Claimed</dt><dd className="text-right tabular-nums">{f(p.claimedFlow)}</dd>
        </dl>
      )}
      {detailed && (
        <p className="text-[11px] leading-relaxed text-muted">
          Next settlement: {p.settlementReady ? "you are eligible for the next batch, which a reviewer publishes." : "you join a batch once you reach 1,000 funded FLOW."} Each published round stays open for 30 days, and you sign your own claim. Campaign PTS are separate and never convert.
        </p>
      )}
    </section>
  );
}
