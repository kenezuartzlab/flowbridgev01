/**
 * V34 — verified progress toward the 1,000 FLOW claim minimum. Render-only:
 * every number comes from the server progression; nothing is signed here.
 */
import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import type { RewardProgression } from "@/lib/rewards/rewardProgression";
import { trackProductEvent, type ProductArea } from "@/lib/ops/productEvents";
import { RewardPolicyDetails } from './RewardPolicyDetails';
import { SIGNUP_BONUS_POINTS, REFERRER_SIGNUP_BONUS_POINTS, SIGNUP_BONUS_EFFECTIVE_AT, SIGNUP_BONUS_POLICY_VERSION } from "@/lib/rewards/signupBonusPolicy";
import { buildRewardsSummary, TIMELINE, BLOCKER_LABEL } from "@/lib/rewards/rewardsSummary";

const f = (n: number) => Math.floor(n).toLocaleString("en-US");
const d = (s: number) => new Date(s * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

const SOURCE_LABEL = { CORE_SWAP: "Funded Mainnet swaps", SIGNUP_BONUS: "Funded signup / referral signup", REFERRAL_MILESTONE: "Funded referral milestones", OTHER: "Other funded ledger points" } as const;

export function RewardProgressPanel({ p, area, detailed = false }: { p: RewardProgression; area: ProductArea; detailed?: boolean }) {
  useEffect(() => {
    trackProductEvent("reward_progress_viewed", area, { once: true });
    for (const t of p.thresholdsReached) trackProductEvent(`reward_threshold_${t}` as const, area, { once: true });
    if (p.settlementReady) trackProductEvent("settlement_eligible", area, { once: true });
    if (p.lifecycle === "ALLOCATED_ON_CHAIN") trackProductEvent("allocation_published", area, { once: true });
    if (p.lifecycle === "CLAIMABLE_NOW") trackProductEvent("claim_available", area, { once: true });
  }, [p, area]);

  const a = p.allocation;
  const s = buildRewardsSummary({ progression: p, nowSec: Math.floor(Date.now() / 1000) });
  const stageIdx = TIMELINE.findIndex((t) => t.stage === s.stage);
  return (
    <section aria-labelledby={`rp-${area}`} className="fb-surface space-y-3 p-4" data-testid="reward-progress">
      <div className="rounded-xl border border-hairline p-3" data-testid="claim-now-card">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted">FLOW available to claim</p>
        <p className="text-[22px] font-bold tabular-nums">{f(s.claimableNow)} FLOW</p>
        <p className="text-[12px] leading-relaxed" role="status">{s.message}</p>
        {s.claimableNow === 0 && <p className="mt-1 text-[11px] font-semibold text-muted">Blocked by: {BLOCKER_LABEL[s.blocker]}</p>}
        {s.claimableNow > 0 && <Link to="/earn" className="mt-2 inline-flex min-h-[40px] items-center rounded-full bg-primary px-4 text-[12px] font-bold text-primary-foreground">Claim in wallet</Link>}
      </div>
      <p id={`rp-${area}`} className="text-[10px] font-black uppercase tracking-[0.14em] text-primary">Eligible toward next FLOW batch</p>
      <div>
        <p className="text-[18px] font-bold tabular-nums">{f(p.availableTowardMinimum)} / {f(p.minimum)} FLOW</p>
        <p className="text-[12px] text-muted">1 eligible funded PTS = 1 FLOW. {p.remainingToMinimum > 0 ? `${f(p.remainingToMinimum)} more eligible PTS needed.` : "Minimum reached; a published payout round is still required."}</p>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted/20" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.percent} aria-label="Progress toward 1,000 FLOW">
        <div className="h-full rounded-full bg-primary motion-safe:transition-[width]" style={{ width: `${p.percent}%` }} />
      </div>
      <p className="text-[12px] font-semibold">{p.lifecycleLabel}</p>
      <p className="text-[12px] leading-relaxed text-muted">Your total FLOW Points are not your withdrawable balance. Only verified, funded BOT Mainnet points count toward the 1,000 FLOW minimum.</p>
      {a && !a.claimed && <p className="text-[11.5px] text-muted">Round #{a.epochId}: {f(a.amountFlow)} FLOW · window {d(a.claimStart)} – {d(a.claimEnd)}</p>}

      <details><summary className="cursor-pointer text-sm font-semibold">Approved earning policy</summary><RewardPolicyDetails /></details>

      {detailed && (
        <details className="border-t border-hairline pt-3"><summary className="cursor-pointer text-[11.5px] font-semibold">Points breakdown</summary>
        {p.recordedComposition && <div className="mt-3 text-[12px] leading-relaxed">
          <p className="font-semibold">Recorded total: {f(p.earnedPoints)} PTS</p>
          <p>{f(p.recordedComposition.storedHistory)} stored historical PTS + {f(p.recordedComposition.ownSignup)} own signup PTS + {f(p.recordedComposition.referralSignup)} referral signup PTS.</p>
          <p className="mt-1 text-muted">This explains the displayed total, not a ledger-verified Mainnet entitlement. The checks below are separate and must not be added to it. Signup awards count only when their policy, account, wallet and confirmed backing pass the canonical Mainnet checks.</p>
        </div>}
        {p.reconciliationEvidence && <p className="mt-2 text-[12px] leading-relaxed text-muted">Ledger-verified Mainnet swaps: {f(p.reconciliationEvidence.coreSwap)} PTS. Historical held milestones: {f(p.reconciliationEvidence.historicalHeld)} PTS. Stored history without qualifying ledger evidence: {f(p.reconciliationEvidence.unsupportedStored)} PTS. Held and unsupported history remain excluded.</p>}
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-hairline pt-3 text-[11.5px]">
          {(Object.keys(SOURCE_LABEL) as (keyof typeof SOURCE_LABEL)[]).filter((k) => p.sources[k] > 0).map((k) => (
            <div key={k} className="contents"><dt className="text-muted">{SOURCE_LABEL[k]}</dt><dd className="text-right tabular-nums">{f(p.sources[k])}</dd></div>
          ))}
          <dt className="text-muted">Eligible after verification</dt><dd className="text-right tabular-nums">{f(p.eligibleFundedFlow)} PTS</dd>
          <dt className="text-muted">Awaiting funding · excluded</dt><dd className="text-right tabular-nums">{f(p.pendingUnfunded)} PTS</dd>
          <dt className="text-muted">Held for review · blocks settlement</dt><dd className="text-right tabular-nums">{f(p.reviewHeld)} PTS</dd>
          <dt className="text-muted">Testnet · excluded</dt><dd className="text-right tabular-nums">{f(p.testnetExcluded)} PTS</dd>
          <dt className="text-muted">Nonclaimable history · excluded</dt><dd className="text-right tabular-nums">{f(p.historicalNonclaimable)} PTS</dd>
          <dt className="text-muted">Allocated to published rounds</dt><dd className="text-right tabular-nums">{f(p.settledFlow)} FLOW</dd>
          <dt className="font-semibold">Toward next payout</dt><dd className="text-right font-semibold tabular-nums">{f(p.availableTowardMinimum)} PTS</dd>
          <dt className="text-muted">FLOW already claimed</dt><dd className="text-right tabular-nums">{f(p.claimedFlow)} FLOW</dd>
          <dt className="text-muted">Published, awaiting opening</dt><dd className="text-right tabular-nums">{f(s.awaitingSettlement)} FLOW</dd>
        </dl></details>
      )}
      {detailed && (
        <details className="text-[11px] leading-relaxed text-muted"><summary className="cursor-pointer font-semibold">Calculation details</summary><p className="mt-2">
          Computation: verified funded Mainnet PTS − points already allocated to payout rounds = points toward your next payout (never below zero). Source rows show funded ledger totals before verification; exclusions and review categories may overlap, so do not add them together.
        </p></details>
      )}
      {detailed && (
        <details className="border-t border-hairline pt-3"><summary className="cursor-pointer text-[11.5px] font-semibold">Payout stages and conditions</summary><ol className="mt-2 space-y-1 text-[11.5px]" aria-label="Reward timeline">
          {TIMELINE.map((t, i) => (
            <li key={t.stage} className={i <= stageIdx ? "font-semibold" : "text-muted"} aria-current={i === stageIdx ? "step" : undefined}>
              {i <= stageIdx ? "●" : "○"} {t.label} — <span className="font-normal">{t.explain}</span>
            </li>
          ))}
        </ol></details>
      )}
      {detailed && <details className="border-t border-hairline pt-3"><summary className="cursor-pointer text-[11.5px] font-semibold">When can I claim?</summary><ol className="mt-2 space-y-2 text-[12px] leading-relaxed">
        <li><strong>1. Earn and qualify.</strong> Reach 1,000 eligible funded PTS, verify your email and bind your wallet. Pending funding, review-held points, Testnet, unsupported history, Campaign PTS and XP do not qualify.</li>
        <li><strong>2. Wait for publication.</strong> A reviewer must publish your allocation in a payout round. Reaching the minimum alone does not unlock a claim; no payout date is promised.</li>
        <li><strong>3. Claim during the window.</strong> Once your published round is open and its live checks pass, claim FLOW with your allocated wallet. New rounds have a 30-day claim window. Your wallet confirms the transaction.</li>
      </ol></details>}
    </section>
  );
}
