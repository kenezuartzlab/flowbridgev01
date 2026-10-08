/**
 * Growth V1 — the single dominant next action on Home, plus Why FlowBridge,
 * First Trade and DONE/NOW/NEXT progress. Navigation only; nothing is signed.
 */
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ArrowRight, CheckCircle2, Circle, CircleDot, Share2 } from "lucide-react";
import { useAccountActivation } from "@/lib/growth/useAccountActivation";
import { forYouNow, resolveNextAction } from "@/lib/growth/nextAction";
import { missionProgress } from "@/lib/growth/missionProgress";
import { buildShareUrl, REFERRAL_NOTE } from "@/lib/growth/shareReferral";
import { trackProductEvent } from "@/lib/ops/productEvents";
import { usePersonalProgress } from "@/lib/rewards/usePersonalProgress";
import { RewardProgressPanel } from "@/components/rewards/RewardProgressPanel";

const WHY = [
  "Trade across approved BOT ecosystem liquidity (BDEX and CaSwap)",
  "Auto finds supported routes and shows ATOMIC or STAGED before you sign",
  "Explore liquidity, staking, campaigns and FLOW Points separately",
  "Track your verified ecosystem activity",
];

export function NextActionCard({ confirmedTrades }: { confirmedTrades: number }) {
  const a = useAccountActivation();
  const input = {
    signedIn: a.signedIn,
    emailVerified: a.emailVerified,
    walletBound: a.walletBound,
    activeMissionHref: a.view.state === "ACTIVE_MISSION" ? a.view.primary.href : null,
    confirmedTrades,
    liquidityPositions: 0,
    activeStakes: 0,
    activeCampaigns: 0,
  };
  const legacy = resolveNextAction(input);
  const { data: personal } = usePersonalProgress(a.signedIn);
  const nba = a.signedIn ? personal?.nextBestAction ?? null : null;
  const next = nba ? { id: nba.id, label: nba.label, reason: nba.reason, href: nba.destination, secondary: null } : legacy;
  const mission = useMemo(
    () => missionProgress({ explored: true, emailVerified: a.emailVerified, walletBound: a.walletBound, confirmedTrades, earnExplored: false, verifiedEcosystemActivities: 0 }),
    [a.emailVerified, a.walletBound, confirmedTrades],
  );

  async function share() {
    const url = buildShareUrl("/");
    if (!url) return;
    try {
      if (navigator.share) await navigator.share({ title: "FlowBridge", text: "Smart trading on BOT Chain", url });
      else await navigator.clipboard.writeText(url);
    } catch { /* user closed share sheet */ }
  }

  if (a.loading) return null;
  return (
    <section aria-labelledby="next-action-title" className="fb-surface space-y-3 p-4" data-testid="next-action-card">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-primary">For you now</p>
      <h2 id="next-action-title" className="text-[15px] font-bold leading-snug">{nba ? nba.label : forYouNow(input)}</h2>
      <p className="text-[12px] leading-relaxed text-muted">{next.reason}</p>

      {next.id === "FIRST_TRADE" && (
        <ol className="list-decimal space-y-0.5 pl-4 text-[11.5px] text-muted">
          <li>Choose the two tokens.</li>
          <li>Auto finds supported routes and shows the DEX and number of transactions.</li>
          <li>Your wallet always signs. Funds stay in your wallet until the transaction runs.</li>
        </ol>
      )}

      {!a.signedIn && (
        <ul className="space-y-1 text-[11.5px]" aria-label="Why FlowBridge">
          {WHY.map((w) => <li key={w} className="flex gap-1.5"><CheckCircle2 aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />{w}</li>)}
          <li className="text-[10.5px] text-muted">FlowBridge is the smart app layer above BDEX and CaSwap — it does not replace them.</li>
        </ul>
      )}

      <Link
        to={next.id === "FIRST_TRADE" ? "/trade" : next.href}
        onClick={() => trackProductEvent(next.id === "MAKE_ELIGIBLE_TRADE" ? "eligible_reward_activity_started" : next.id === "CLAIM_FLOW" ? "claim_started" : "explore_opened", "home")}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-bold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {next.id === "FIRST_TRADE" ? "Find a route" : next.label} <ArrowRight aria-hidden className="h-4 w-4" />
      </Link>
      {next.secondary && (
        <Link to={next.secondary.href} className="block text-center text-[12px] font-semibold text-primary underline-offset-2 hover:underline">
          {next.secondary.label}
        </Link>
      )}

      {personal && <RewardProgressPanel p={personal.progression} area="home" />}

      {a.signedIn && (
        <div aria-label="Your progress" className="border-t border-hairline pt-3">
          <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-muted">Progress · {mission.done}/{mission.total}</p>
          <ul className="space-y-1">
            {mission.steps.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-[11.5px]">
                {s.status === "DONE" ? <CheckCircle2 aria-hidden className="h-3.5 w-3.5 text-primary" /> : s.status === "NOW" ? <CircleDot aria-hidden className="h-3.5 w-3.5 text-primary" /> : <Circle aria-hidden className="h-3.5 w-3.5 text-muted" />}
                <span className="w-11 shrink-0 text-[9.5px] font-black tracking-wider">{s.status}</span>
                <span className={s.status === "NEXT" ? "text-muted" : ""}>{s.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button type="button" onClick={share} className="flex items-center gap-1.5 text-[11px] font-semibold text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Share2 aria-hidden className="h-3.5 w-3.5" /> Share FlowBridge
        <span className="sr-only">. {REFERRAL_NOTE}</span>
      </button>
    </section>
  );
}
