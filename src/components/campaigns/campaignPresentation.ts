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

/* ------------------------------------------------------------------ *
 * V9.1 — deterministic decorative cover art.
 * Derived only from known campaign metadata (slug + chains + task rules).
 * Purely decorative: it never implies rewards, partners or social proof.
 * ------------------------------------------------------------------ */

export interface CampaignCover {
  /** CSS gradient for the cover surface. */
  gradient: string;
  /** Accent colour used for arcs / rings / route lines. */
  accent: string;
  /** Deterministic category label from authoritative rules. */
  category: string;
  /** 0..1 seeds so the generated art differs per campaign but is stable. */
  seed: number;
}

const COVER_PALETTES: { from: string; to: string; accent: string }[] = [
  { from: "#043b32", to: "#0a5f4a", accent: "#34d399" },
  { from: "#12224d", to: "#1d3f8f", accent: "#60a5fa" },
  { from: "#2b1147", to: "#4c1d95", accent: "#c084fc" },
  { from: "#062b3d", to: "#0e5566", accent: "#22d3ee" },
  { from: "#3b1a05", to: "#7c3a08", accent: "#fb923c" },
];

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Deterministic category from the campaign's own rules — never invented. */
export function campaignCategory(campaign: CampaignApiCampaign): string {
  const { source, destination } = campaignChains(campaign);
  if (source !== undefined && destination !== undefined && source !== destination) {
    return "Bridge route";
  }
  const kinds = new Set<string>();
  for (const task of campaign.tasks) {
    for (const rule of rulesOf(task)) {
      if (rule.type === "ACTIVITY_KIND" && typeof rule.kind === "string") kinds.add(rule.kind);
    }
  }
  if (kinds.has("SWAP_EXECUTED")) return "Swap quest";
  if (kinds.size > 0) return "Bridge quest";
  return "Campaign";
}

export function campaignCover(campaign: CampaignApiCampaign): CampaignCover {
  const hash = hashString(`${campaign.slug}:${campaign.campaignId}`);
  const palette = COVER_PALETTES[hash % COVER_PALETTES.length]!;
  return {
    gradient: `linear-gradient(135deg, ${palette.from} 0%, ${palette.to} 100%)`,
    accent: palette.accent,
    category: campaignCategory(campaign),
    seed: (hash % 1000) / 1000,
  };
}

/** Stable de-duplication by campaign identity (id first, slug fallback). */
export function dedupeCampaigns(list: CampaignApiCampaign[]): CampaignApiCampaign[] {
  const seen = new Set<string>();
  const out: CampaignApiCampaign[] = [];
  for (const c of list) {
    const key = (c.campaignId || c.slug || "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}
