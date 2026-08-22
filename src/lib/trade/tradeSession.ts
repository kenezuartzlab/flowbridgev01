/**
 * FlowBridge V15.3G §1–§3 — the single app-session Trade authority.
 *
 * Root cause of the observed reset: the Trade mode (CA/BOT · Any-pair swap ·
 * Bridge) and the swap form draft lived in route-local React state inside `App`,
 * which is rendered by `/` and `/trade`. Navigating away unmounted that
 * component, so returning to Trade re-ran the `useState` initializers and threw
 * the user's pair mode and typed amount away.
 *
 * Like `networkSession`, this store lives at MODULE scope (above every route),
 * in memory only: a genuine browser reload starts a new runtime and legitimately
 * returns to defaults, while SPA navigation can never reset it.
 *
 * Presentation/session state only — no addresses, amounts-as-authority,
 * signing, ordering, verification or settlement behavior lives here. A hydrated
 * draft is still fully revalidated (registry, balance, allowance, live fee,
 * quote, simulation) by the swap surface before the user's wallet can sign.
 */
import { useSyncExternalStore } from "react";

export type TradeTab = "CA/BOT" | "BOT/USDT" | "BRIDGE";
export type TradeTabSource = "DEFAULT" | "USER" | "ACTION_INTENT" | "ROUTE";

export type SwapDraftScope = "MAINNET" | "TESTNET";

export interface SwapDraft {
  chainScope: SwapDraftScope;
  tokenInSymbol: string;
  tokenOutSymbol: string;
  amount: string;
}

export interface TradeSessionState {
  tab: TradeTab;
  tabSource: TradeTabSource;
  swapDraft: SwapDraft | null;
  initializedAt: string;
  changedAt: string;
}

const initialAt = new Date().toISOString();

let state: TradeSessionState = {
  tab: "BOT/USDT",
  tabSource: "DEFAULT",
  swapDraft: null,
  initializedAt: initialAt,
  changedAt: initialAt,
};

const listeners = new Set<() => void>();
/** Route/intent hints apply at most once per runtime, per hint key. */
const appliedHints = new Set<string>();
/** The session-derived default tab is only ever applied once per runtime. */
let defaultApplied = false;

function commit(next: Partial<TradeSessionState>) {
  state = { ...state, ...next, changedAt: new Date().toISOString() };
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getTradeSession(): TradeSessionState {
  return state;
}

/** Canonical tab setter. Every writer in the app goes through this function. */
export function setTradeTab(tab: TradeTab, source: TradeTabSource = "USER") {
  if (state.tab === tab && state.tabSource === source) return;
  commit({ tab, tabSource: source });
}

/**
 * Applies the route-progress-derived starting tab, but only while the user has
 * not chosen anything yet, and only once per runtime — so returning to Trade
 * never overrides a deliberate pair-mode choice.
 */
export function applyDefaultTradeTab(tab: TradeTab): boolean {
  if (defaultApplied || state.tabSource !== "DEFAULT") return false;
  defaultApplied = true;
  commit({ tab, tabSource: "DEFAULT" });
  return true;
}

/** Applies an explicit deep-link / ActionIntent tab target once per hint key. */
export function applyExplicitTradeTab(input: {
  tab: TradeTab;
  hintKey: string;
  source: Exclude<TradeTabSource, "DEFAULT" | "USER">;
}): boolean {
  if (appliedHints.has(input.hintKey)) return false;
  appliedHints.add(input.hintKey);
  defaultApplied = true;
  commit({ tab: input.tab, tabSource: input.source });
  return true;
}

/** Persists the in-progress swap form so navigation does not erase it. */
export function setSwapDraft(draft: SwapDraft) {
  const prev = state.swapDraft;
  if (
    prev &&
    prev.chainScope === draft.chainScope &&
    prev.tokenInSymbol === draft.tokenInSymbol &&
    prev.tokenOutSymbol === draft.tokenOutSymbol &&
    prev.amount === draft.amount
  ) {
    return;
  }
  commit({ swapDraft: draft });
}

export function clearSwapDraft() {
  if (!state.swapDraft) return;
  commit({ swapDraft: null });
}

/** Returns the draft only when it belongs to the network now being rendered. */
export function readSwapDraft(scope: SwapDraftScope): SwapDraft | null {
  const d = state.swapDraft;
  return d && d.chainScope === scope ? d : null;
}

export function useTradeSession(): TradeSessionState {
  return useSyncExternalStore(subscribe, getTradeSession, getTradeSession);
}

/** `[tab, setTab]` shaped for the existing workspace call sites. */
export function useTradeTab(): [TradeTab, (next: TradeTab, source?: TradeTabSource) => void] {
  const session = useTradeSession();
  return [session.tab, setTradeTab];
}

/** Test-only reset; never called from product code. */
export function __resetTradeSessionForTests() {
  const at = new Date().toISOString();
  state = {
    tab: "BOT/USDT",
    tabSource: "DEFAULT",
    swapDraft: null,
    initializedAt: at,
    changedAt: at,
  };
  appliedHints.clear();
  defaultApplied = false;
  for (const l of listeners) l();
}
