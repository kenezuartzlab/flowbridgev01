/**
 * Growth V1 — DONE / NOW / NEXT mission progress from verified evidence only.
 * A trade step completes only on a receipt-confirmed trade, never on a quote.
 */
export type MissionStepId = "EXPLORE" | "VERIFY_EMAIL" | "BIND_WALLET" | "FIRST_TRADE" | "EXPLORE_EARN" | "ECOSYSTEM_ACTIVITY";
export type MissionStatus = "DONE" | "NOW" | "NEXT";

export interface MissionEvidence {
  explored: boolean;
  emailVerified: boolean;
  walletBound: boolean;
  confirmedTrades: number;
  earnExplored: boolean;
  verifiedEcosystemActivities: number;
}

const STEPS: { id: MissionStepId; title: string; done: (e: MissionEvidence) => boolean }[] = [
  { id: "EXPLORE", title: "Explore FlowBridge", done: (e) => e.explored },
  { id: "VERIFY_EMAIL", title: "Verify email", done: (e) => e.emailVerified },
  { id: "BIND_WALLET", title: "Bind wallet", done: (e) => e.walletBound },
  { id: "FIRST_TRADE", title: "Complete first trade (confirmed on-chain)", done: (e) => e.confirmedTrades > 0 },
  { id: "EXPLORE_EARN", title: "Explore Earn", done: (e) => e.earnExplored },
  { id: "ECOSYSTEM_ACTIVITY", title: "Complete eligible ecosystem activity", done: (e) => e.verifiedEcosystemActivities > 0 },
];

export function missionProgress(e: MissionEvidence) {
  let nowAssigned = false;
  const steps = STEPS.map((s) => {
    let status: MissionStatus;
    if (s.done(e)) status = "DONE";
    else if (!nowAssigned) { status = "NOW"; nowAssigned = true; }
    else status = "NEXT";
    return { id: s.id, title: s.title, status };
  });
  const done = steps.filter((s) => s.status === "DONE").length;
  return { steps, done, total: steps.length, grantsReward: false as const };
}
