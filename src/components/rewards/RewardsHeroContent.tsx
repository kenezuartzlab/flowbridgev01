/**
 * V12.4C — Rewards hero content for Home.
 *
 * Presentation only. Every number is passed in from `/api/users/incentives`
 * (server-authoritative): cumulative FLOW Points, today's accrual, the daily
 * core-swap cap, claimable FLOW and lifetime claimed FLOW. Nothing is invented
 * and no reward rule is duplicated here.
 *
 * Vocabulary is strict: PTS = off-chain FLOW Points, FLOW = the ERC-20 token.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Check, Sparkles } from "lucide-react";
import { PageIcon } from "@/components/layout/PageIcon";
import { formatUsd } from "@/lib/format";
import { FLOW_TOKEN, PTS, formatPts } from "@/lib/points";

export interface RewardsHeroContentProps {
  label: string;
  ctaLabel: string;
  loading: boolean;
  hasData: boolean;
  flowPoints: number;
  pointsToday: number;
  corePointsToday: number;
  dailyCap: number;
  claimableFlow: number;
  claimedFlow: number;
  volumeUsd: number;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Count-up that lands on the authoritative value; instant with reduced motion. */
function useCountUp(target: number, enabled: boolean) {
  const [value, setValue] = useState(target);
  const previous = useRef(target);
  useEffect(() => {
    if (!enabled || target === previous.current) {
      previous.current = target;
      setValue(target);
      return;
    }
    const from = previous.current;
    previous.current = target;
    const start = performance.now();
    const duration = 700;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, enabled]);
  return value;
}

export function RewardsHeroContent({
  label,
  ctaLabel,
  loading,
  hasData,
  flowPoints,
  pointsToday,
  corePointsToday,
  dailyCap,
  claimableFlow,
  claimedFlow,
  volumeUsd,
}: RewardsHeroContentProps) {
  const reduced = usePrefersReducedMotion();
  const shown = useCountUp(flowPoints, hasData && !reduced);
  const pending = loading && !hasData;

  const capProgress = dailyCap > 0 ? Math.min(1, corePointsToday / dailyCap) : 0;
  const remainingToCap = Math.max(0, dailyCap - corePointsToday);
  const ready = claimableFlow > 0;

  return (
    <>
      <div className="relative flex items-start justify-between gap-3">
        <p className="font-mono text-[10px] font-black uppercase tracking-[0.18em] opacity-80">
          {label}
        </p>
        <Link
          to="/earn"
          className={`inline-flex min-h-[32px] items-center gap-1 rounded-full px-3 font-mono text-[10px] font-black uppercase tracking-[0.1em] transition-colors ${
            ready
              ? "bg-white/90 text-black hover:bg-white"
              : "bg-white/20 hover:bg-white/30"
          }`}
        >
          {ready ? `Claim ${FLOW_TOKEN}` : ctaLabel} <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Priority 1 — cumulative FLOW Points balance. */}
      <p className="relative mt-1.5 font-mono text-[30px] font-black leading-none tabular-nums tracking-[-0.02em] sm:mt-2 sm:text-[42px]">
        {pending ? "—" : shown.toLocaleString("en-US")}
        <span className="ml-2 align-baseline text-[13px] font-black opacity-80">{PTS}</span>
      </p>

      {/* Priority 2 + 3 — momentum and today's cap progress. */}
      <div className="relative mt-2.5">
        <div className="flex items-center justify-between gap-2 font-mono text-[9.5px] font-black uppercase tracking-[0.1em] opacity-85">
          <span className="inline-flex items-center gap-1">
            {pointsToday > 0 ? (
              <>
                <Sparkles className="h-3 w-3" aria-hidden />
                Today +{formatPts(pointsToday)} {PTS}
              </>
            ) : (
              "Next verified swap grows your FLOW Points"
            )}
          </span>
          <span className="shrink-0 tabular-nums">
            {pending ? "—" : `${formatPts(corePointsToday)} / ${formatPts(dailyCap)}`}
          </span>
        </div>
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/25">
          <div
            className={`h-full rounded-full bg-white transition-[width] duration-700 ${
              pointsToday > 0 && !reduced ? "fb-pulse-once" : ""
            }`}
            style={{ width: `${Math.round(capProgress * 100)}%` }}
          />
        </div>
        {corePointsToday > 0 && remainingToCap > 0 && (
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.08em] opacity-70">
            {formatPts(remainingToCap)} {PTS} until today&apos;s cap
          </p>
        )}
      </div>

      {/* Priority 4 + 5 — claim state and verified volume. */}
      <div className="relative mt-3 grid grid-cols-2 gap-2 sm:mt-4">
        <div
          className={`fb-hero-tile flex items-center gap-2 px-2.5 py-2 sm:px-3 sm:py-2.5 ${
            ready && !reduced ? "fb-ready-glow" : ""
          }`}
        >
          {ready ? (
            <PageIcon page="home" slot="claimable" size={24} />
          ) : (
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-white/25">
              <Check className="h-3.5 w-3.5" aria-hidden />
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate font-mono text-[9px] font-black uppercase tracking-[0.12em] opacity-80">
              {ready ? `${FLOW_TOKEN} ready` : `${FLOW_TOKEN} rewards`}
            </span>
            <span className="block truncate font-mono text-[13px] font-black tabular-nums sm:text-[14px]">
              {pending
                ? "—"
                : ready
                  ? `${formatPts(claimableFlow)} ${FLOW_TOKEN} ready`
                  : "All FLOW claimed"}
            </span>
            {!pending && !ready && claimedFlow > 0 && (
              <span className="block truncate font-mono text-[9px] uppercase tracking-[0.08em] opacity-65">
                {formatPts(claimedFlow)} {FLOW_TOKEN} claimed
              </span>
            )}
            {!pending && !ready && claimedFlow === 0 && (
              <span className="block truncate font-mono text-[9px] uppercase tracking-[0.08em] opacity-65">
                Earn more by swapping
              </span>
            )}
          </span>
        </div>
        <div className="fb-hero-tile flex items-center gap-2 px-2.5 py-2 sm:px-3 sm:py-2.5">
          <PageIcon page="home" slot="volume" size={24} />
          <span className="min-w-0">
            <span className="block truncate font-mono text-[9px] font-black uppercase tracking-[0.12em] opacity-80">
              Verified volume
            </span>
            <span className="block font-mono text-[14px] font-black tabular-nums sm:text-[15px]">
              {volumeUsd > 0 ? formatUsd(volumeUsd) : "—"}
            </span>
          </span>
        </div>
      </div>
    </>
  );
}
