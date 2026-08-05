/**
 * Local, off-chain arcade state for the Games hub.
 *
 * These are *Play Points* — a purely local engagement score kept in
 * localStorage. They are deliberately separate from FLOW rewards, which are
 * server-owned and only earned through real swap/bridge volume.
 */

const KEY = "fb_play_state_v1";

export type Challenge = {
  id: string;
  label: string;
  hint: string;
  points: number;
};

export const CHALLENGES: Challenge[] = [
  { id: "daily-spin", label: "Spin the wheel", hint: "Use today's Lucky Spin", points: 40 },
  { id: "streak", label: "Check in", hint: "Open FlowBridge today", points: 20 },
  { id: "play-game", label: "Play a game", hint: "Finish any round", points: 30 },
  { id: "visit-markets", label: "Scout the markets", hint: "Open the Markets tab", points: 25 },
];

export type PlayState = {
  points: number;
  spins: number;
  lastSpinDay: string | null;
  claimed: Record<string, string>;
  bestStreak: number;
};

const EMPTY: PlayState = {
  points: 0,
  spins: 0,
  lastSpinDay: null,
  claimed: {},
  bestStreak: 0,
};

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function readPlayState(): PlayState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<PlayState>) };
  } catch {
    return EMPTY;
  }
}

export function writePlayState(next: PlayState): PlayState {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable (private mode) — state stays in memory */
    }
  }
  return next;
}

export function isClaimedToday(state: PlayState, id: string) {
  return state.claimed[id] === today();
}

export function canSpinToday(state: PlayState) {
  return state.lastSpinDay !== today();
}

/** Wheel segments: label + play-point payout. */
export const WHEEL = [
  { label: "10", points: 10 },
  { label: "25", points: 25 },
  { label: "50", points: 50 },
  { label: "5", points: 5 },
  { label: "75", points: 75 },
  { label: "15", points: 15 },
  { label: "100", points: 100 },
  { label: "30", points: 30 },
] as const;
