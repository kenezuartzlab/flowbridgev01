/**
 * V34 — deterministic personal reward answers for Flow AI (pure).
 * Answers come only from the CALLER's verified progression; signed-out callers
 * get no account data. Never guarantees amounts or dates beyond chain facts.
 */
import type { RewardProgression } from "@/lib/rewards/rewardProgression";
import type { NextBestAction } from "@/lib/growth/nextBestAction";

export type ProgressQuestion = "ELIGIBLE" | "REMAINING" | "NOT_CLAIMABLE" | "NEXT" | "ROUND" | "WHEN" | "ROUTE";

/**
 * Patterns must require reward/points/claim context. Generic phrases like
 * "remaining", "next step" or "route available" belong to the normal planner
 * and must never be intercepted here.
 */
const REWARD_WORD = /(reward|points?|flow points?|claim|minimum|payout|settlement|earn)/i;
const RULES: [ProgressQuestion, RegExp][] = [
  ["NOT_CLAIMABLE", /why .*(not|n't) (claimable|count)|points .*not claimable/i],
  ["REMAINING", /how (much|many) more.*(claim|points?|flow)|until i can claim|(flow )?points? remaining|remaining (to|until|for) (the )?(claim|minimum)/i],
  ["ROUND", /(included|in) (a|the)? ?payout round|am i (included|allocated).*(round|payout|settlement)/i],
  ["WHEN", /when can i claim|claim (open|window)/i],
  ["ELIGIBLE", /how many .*(eligible|flow points)|my (flow )?points/i],
  ["NEXT", /(what (can|should) i do next|next step).*(reward|points?|flow|claim|earn)/i],
];

/** Generic route-availability questions are NOT progress questions. */
export function isRewardContext(q: string): boolean {
  return REWARD_WORD.test(q);
}

export function matchProgressQuestion(q: string): ProgressQuestion | null {
  for (const [k, re] of RULES) if (re.test(q)) return k;
  return null;
}

const f = (n: number) => Math.floor(n).toLocaleString("en-US");
const d = (s: number) => new Date(s * 1000).toUTCString();

export function answerProgressQuestion(kind: ProgressQuestion, ctx: { signedIn: boolean; progression: RewardProgression | null; next: NextBestAction | null }): string {
  if (!ctx.signedIn || !ctx.progression)
    return kind === "ROUTE"
      ? "Open Trade and pick two tokens — Auto shows whether a supported route exists right now, before anything is signed."
      : "Sign in to see your own reward progress. I can only read your own verified account.";
  const p = ctx.progression;
  switch (kind) {
    case "ELIGIBLE": return `You have ${f(p.eligibleFundedFlow)} eligible, funded Mainnet FLOW Points (${f(p.availableTowardMinimum)} not yet settled).`;
    case "REMAINING": return p.remainingToMinimum === 0 ? "You have reached the 1,000 FLOW claim minimum." : `${f(p.availableTowardMinimum)} / 1,000 FLOW — ${f(p.remainingToMinimum)} FLOW remaining to the claim minimum.`;
    case "NOT_CLAIMABLE": {
      const parts = [
        p.pendingUnfunded ? `${f(p.pendingUnfunded)} not yet funded` : "",
        p.reviewHeld ? `${f(p.reviewHeld)} held for review` : "",
        p.testnetExcluded ? `${f(p.testnetExcluded)} from Testnet` : "",
        p.historicalNonclaimable ? `${f(p.historicalNonclaimable)} unsupported historical` : "",
      ].filter(Boolean);
      return `Only funded, reconciled Mainnet points count, and claims need at least 1,000 FLOW in a published payout round. ${parts.length ? `Not counted: ${parts.join(", ")}.` : "None of your points are excluded."} Campaign PTS are separate and never convert.`;
    }
    case "ROUND": return p.allocation && !p.allocation.claimed ? `Yes — ${f(p.allocation.amountFlow)} FLOW in round #${p.allocation.epochId}.` : p.settlementReady ? "Not yet. You are eligible for the next settlement batch, which a reviewer publishes." : "No current unclaimed payout round includes your wallet.";
    case "WHEN": return p.allocation && !p.allocation.claimed ? `Round #${p.allocation.epochId} claim window: ${d(p.allocation.claimStart)} to ${d(p.allocation.claimEnd)} (30 days).` : "There is no open allocation for you yet. After you reach 1,000 FLOW and a round is published, the claim window lasts 30 days.";
    case "NEXT": return ctx.next ? `${ctx.next.label}: ${ctx.next.reason}` : "Open Home to see your next step.";
    case "ROUTE": return "Open Trade and pick two tokens — Auto shows whether a supported route exists right now, before anything is signed. You can watch an unavailable route to be notified.";
  }
}
