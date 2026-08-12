/**
 * FLOW Points & XP terminology (spec v1.1).
 *
 * Canonical rule: FLOW Points (PTS) are off-chain, non-transferable accounting
 * units. XP is engagement/reputation and never converts to FLOW. FLOW is the
 * scarce on-chain token — it is only ever displayed with the unit "FLOW".
 *
 * Never label off-chain points with the unit "FLOW".
 */

export const PTS = "PTS";
export const XP = "XP";
export const FLOW_TOKEN = "FLOW";

/** True once a real FLOW token address is configured for this environment. */
export const FLOW_TOKEN_ADDRESS: string | null =
  (import.meta as any)?.env?.VITE_FLOW_TOKEN_ADDRESS || null;

export const FLOW_TOKEN_LIVE = !!FLOW_TOKEN_ADDRESS;

export function formatPts(value: number | null | undefined): string {
  return `${Math.max(0, Math.floor(Number(value) || 0)).toLocaleString("en-US")}`;
}

export function ptsWithUnit(value: number | null | undefined): string {
  return `${formatPts(value)} ${PTS}`;
}

export function formatXp(value: number | null | undefined): string {
  return `${Math.max(0, Math.floor(Number(value) || 0)).toLocaleString("en-US")}`;
}

export function xpWithUnit(value: number | null | undefined): string {
  return `${formatXp(value)} ${XP}`;
}

/** Spec §10 — lifetime XP levels. Levels grant status, never reward multipliers. */
export const XP_LEVELS = [
  { level: 1, name: "Newcomer", min: 0, max: 1000 },
  { level: 2, name: "Explorer", min: 1000, max: 5000 },
  { level: 3, name: "Navigator", min: 5000, max: 15000 },
  { level: 4, name: "Pathfinder", min: 15000, max: 40000 },
  { level: 5, name: "Vanguard", min: 40000, max: 100000 },
  { level: 6, name: "Ambassador", min: 100000, max: Number.POSITIVE_INFINITY },
] as const;

export interface XpLevelState {
  level: number;
  name: string;
  /** XP earned inside the current level band. */
  intoLevel: number;
  /** Size of the current band (0 for the final, open-ended level). */
  bandSize: number;
  /** 0..1 progress inside the current band (1 at max level). */
  progress: number;
  nextLevelXp: number | null;
}

export function xpLevel(totalXp: number | null | undefined): XpLevelState {
  const xp = Math.max(0, Math.floor(Number(totalXp) || 0));
  const band = XP_LEVELS.find((b) => xp >= b.min && xp < b.max) ?? XP_LEVELS[XP_LEVELS.length - 1];
  const finite = Number.isFinite(band.max);
  const bandSize = finite ? band.max - band.min : 0;
  const intoLevel = xp - band.min;
  return {
    level: band.level,
    name: band.name,
    intoLevel,
    bandSize,
    progress: finite && bandSize > 0 ? Math.min(1, intoLevel / bandSize) : 1,
    nextLevelXp: finite ? band.max : null,
  };
}

/** Spec §5.2 — daily aggregate qualified swap volume tiers (USD -> total PTS for the day). */
export const SWAP_DAILY_TIERS = [
  { minUsd: 2000, pts: 75 },
  { minUsd: 500, pts: 50 },
  { minUsd: 100, pts: 30 },
  { minUsd: 25, pts: 15 },
  { minUsd: 5, pts: 5 },
] as const;

export const SWAP_MIN_QUALIFYING_USD = 5;
export const SWAP_MAX_DAILY_PTS = 75;

/** Total core swap PTS earned for a day's aggregate qualified volume. */
export function dailySwapPts(qualifiedUsd: number | null | undefined): number {
  const usd = Number(qualifiedUsd) || 0;
  for (const tier of SWAP_DAILY_TIERS) if (usd >= tier.minUsd) return tier.pts;
  return 0;
}

/** The next tier a user is working toward, for progress UI. */
export function nextSwapTier(qualifiedUsd: number | null | undefined) {
  const usd = Number(qualifiedUsd) || 0;
  const ascending = [...SWAP_DAILY_TIERS].reverse();
  return ascending.find((t) => usd < t.minUsd) ?? null;
}
