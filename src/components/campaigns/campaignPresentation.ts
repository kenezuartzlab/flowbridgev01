/**
 * UI-only presentation helpers for the Growth Hub.
 * Derives display metadata from the existing /api/campaigns readthrough.
 * No settlement, no PTS mutation, no fabricated state.
 */
import type {
  CampaignApiCampaign,
  CampaignApiProgress,
  CampaignApiTask,
} from "@/lib/campaign/campaignApi";

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  56: "BNB Chain",
  97: "BNB Testnet",
  196: "BOT Chain",
  968: "BOT Testnet",
};

export const chainName = (id: number) => CHAIN_NAMES[id] ?? `Chain ${id}`;

type Rule = Record<string, unknown>;

function rulesOf(task: CampaignApiTask): Rule[] {
  return Array.isArray(task.rules) ? (task.rules as Rule[]) : [];
}

/** Chain chips backed strictly by SOURCE_CHAIN / DESTINATION_CHAIN rules. */
export function campaignChains(campaign: CampaignApiCampaign): {
  source?: number;
  destination?: number;
} {
  let source: number | undefined;
  let destination: number | undefined;
  for (const task of campaign.tasks) {
    for (const rule of rulesOf(task)) {
      const id = typeof rule.chainId === "number" ? rule.chainId : undefined;
      if (rule.type === "SOURCE_CHAIN" && id !== undefined) source ??= id;
      if (rule.type === "DESTINATION_CHAIN" && id !== undefined) destination ??= id;
    }
  }
  return { source, destination };
}

/** Human requirement summary for a task, derived from its stored rules. */
export function taskRequirements(task: CampaignApiTask): string[] {
  const out: string[] = [];
  for (const rule of rulesOf(task)) {
    switch (rule.type) {
      case "ACTIVITY_KIND":
        out.push(`Verified activity: ${String(rule.kind).replace(/_/g, " ").toLowerCase()}`);
        break;
      case "SOURCE_CHAIN":
        out.push(`Source: ${chainName(Number(rule.chainId))}`);
        break;
      case "DESTINATION_CHAIN":
        out.push(`Destination: ${chainName(Number(rule.chainId))}`);
        break;
      case "ACTION_TYPE":
        out.push("Official direct bridge action");
        break;
      case "MIN_AMOUNT":
        out.push("Minimum transfer amount applies");
        break;
      default:
        break;
    }
  }
  if (task.requiredCount > 1) out.push(`${task.requiredCount} qualifying actions`);
  return out;
}

export type TaskState = "completed" | "in_progress" | "available" | "sign_in";

export interface CampaignMetrics {
  totalPoints: number;
  earnedPoints: number;
  taskCount: number;
  completedTasks: number;
  progress: number;
  isComplete: boolean;
  isLive: boolean;
  hasEnded: boolean;
  endsAt: number;
  timeRemaining: string;
}

export function campaignMetrics(
  campaign: CampaignApiCampaign,
  progress: CampaignApiProgress | undefined,
  now = Date.now(),
): CampaignMetrics {
  const totalPoints = campaign.tasks.reduce(
    (sum, t) => sum + t.points * Math.max(1, t.completionLimitPerWallet),
    0,
  );
  const earnedPoints = progress?.campaignPoints ?? 0;
  const completedTasks = campaign.tasks.filter(
    (t) => progress?.tasks.find((x) => x.taskId === t.taskId)?.completed,
  ).length;
  const taskCount = campaign.tasks.length;
  const endsAt = campaign.endsAt;
  const hasEnded = endsAt > 0 && endsAt <= now;
  const started = campaign.startsAt <= now;

  return {
    totalPoints,
    earnedPoints,
    taskCount,
    completedTasks,
    progress: taskCount ? completedTasks / taskCount : 0,
    isComplete: taskCount > 0 && completedTasks === taskCount,
    isLive: campaign.status === "published" && started && !hasEnded,
    hasEnded,
    endsAt,
    timeRemaining: formatTimeRemaining(endsAt, now),
  };
}

export function taskState(
  task: CampaignApiTask,
  progress: CampaignApiProgress | undefined,
  authenticated: boolean,
): TaskState {
  if (!authenticated) return "sign_in";
  const tp = progress?.tasks.find((x) => x.taskId === task.taskId);
  if (tp?.completed) return "completed";
  if ((tp?.completions ?? 0) > 0) return "in_progress";
  return "available";
}

export function formatTimeRemaining(endsAt: number, now = Date.now()): string {
  if (!endsAt) return "No deadline";
  const ms = endsAt - now;
  if (ms <= 0) return "Ended";
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days} day${days > 1 ? "s" : ""} left`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `${hours} hr${hours > 1 ? "s" : ""} left`;
  const mins = Math.max(1, Math.floor(ms / 60_000));
  return `${mins} min left`;
}

export function formatDate(ts: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export const shortWallet = (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`;
