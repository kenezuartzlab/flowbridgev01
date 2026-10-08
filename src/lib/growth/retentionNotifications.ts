/**
 * V34 — retention notifications (pure). Derived only from verified progression,
 * real on-chain allocations for the caller's own wallet, opted-in route watches
 * and mission state. Stable ids = deduplication; no urgency language.
 */
import type { RewardProgression } from "@/lib/rewards/rewardProgression";

export type RetentionKind =
  | "REWARD_PROGRESS" | "APPROACHING_MINIMUM" | "MINIMUM_REACHED" | "SETTLEMENT_ELIGIBLE"
  | "ALLOCATION_PUBLISHED" | "CLAIM_WINDOW_OPEN" | "CLAIM_WINDOW_CLOSING" | "ROUTE_AVAILABLE" | "MISSION_NEXT_STEP";

export interface RetentionNotification {
  id: string;
  kind: RetentionKind;
  title: string;
  body: string;
  href: string;
  ctaLabel: string;
  performsAction: false;
}

export interface RetentionInput {
  progression: RewardProgression | null;
  nowSec: number;
  routesNowAvailable?: { from: string; to: string }[];
  missionNextStep?: { id: string; title: string; href: string } | null;
}

const n = (id: string, kind: RetentionKind, title: string, body: string, href: string, ctaLabel: string): RetentionNotification =>
  ({ id, kind, title, body, href, ctaLabel, performsAction: false });
const fmt = (v: number) => Math.floor(v).toLocaleString("en-US");
const day = (sec: number) => new Date(sec * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const CLOSING_WINDOW_SEC = 3 * 86_400;

export function deriveRetentionNotifications(i: RetentionInput): RetentionNotification[] {
  const out: RetentionNotification[] = [];
  const p = i.progression;
  if (p) {
    const a = p.allocation;
    if (a && !a.claimed) {
      if (i.nowSec < a.claimStart)
        out.push(n(`ALLOCATION_PUBLISHED:${a.epochId}`, "ALLOCATION_PUBLISHED", `${fmt(a.amountFlow)} FLOW allocated`, `${fmt(a.amountFlow)} FLOW allocated. Claim opens ${day(a.claimStart)}.`, "/earn", "View allocation"));
      else if (i.nowSec <= a.claimEnd) {
        out.push(n(`CLAIM_WINDOW_OPEN:${a.epochId}`, "CLAIM_WINDOW_OPEN", "Your FLOW claim is now available", `${fmt(a.amountFlow)} FLOW can be claimed. You sign the claim in your wallet.`, "/earn", "Open Earn"));
        const left = a.claimEnd - i.nowSec;
        if (left <= CLOSING_WINDOW_SEC) {
          const days = Math.max(1, Math.ceil(left / 86_400));
          out.push(n(`CLAIM_WINDOW_CLOSING:${a.epochId}`, "CLAIM_WINDOW_CLOSING", "Claim window closing", `Your claim window closes in ${days} day${days === 1 ? "" : "s"}.`, "/earn", "Open Earn"));
        }
      }
    }
    if (p.settlementReady)
      out.push(n(`SETTLEMENT_ELIGIBLE:${p.availableTowardMinimum}`, "SETTLEMENT_ELIGIBLE", "Eligible for the next settlement batch", "A reviewer includes you in the next payout round. You will be notified when it is published.", "/earn", "Open Earn"));
    else if (p.availableTowardMinimum >= p.minimum)
      out.push(n("MINIMUM_REACHED", "MINIMUM_REACHED", "You reached 1,000 FLOW", "Your funded FLOW reached the claim minimum.", "/earn", "Open Earn"));
    else if (p.percent >= 75)
      out.push(n("APPROACHING_MINIMUM:75", "APPROACHING_MINIMUM", "Getting close to 1,000 FLOW", `${fmt(p.remainingToMinimum)} FLOW remaining to the claim minimum.`, "/earn", "See progress"));
    else if (p.percent >= 25)
      out.push(n(`REWARD_PROGRESS:${p.thresholdsReached[p.thresholdsReached.length - 1]}`, "REWARD_PROGRESS", "Reward progress updated", `${fmt(p.availableTowardMinimum)} / 1,000 FLOW toward the claim minimum.`, "/earn", "See progress"));
  }
  for (const r of i.routesNowAvailable ?? [])
    out.push(n(`ROUTE_AVAILABLE:${r.from}>${r.to}`, "ROUTE_AVAILABLE", `${r.from} → ${r.to} route available`, "A supported route you watched is available again. Review it before your wallet signs anything.", "/trade", "Open Trade"));
  if (i.missionNextStep)
    out.push(n(`MISSION_NEXT_STEP:${i.missionNextStep.id}`, "MISSION_NEXT_STEP", "Mission next step available", i.missionNextStep.title, i.missionNextStep.href, "Continue"));
  return dedupeNotifications(out);
}

export function dedupeNotifications<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}
