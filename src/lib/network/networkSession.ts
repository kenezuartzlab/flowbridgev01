/**
 * FlowBridge V15.3C — the single app-session network authority.
 *
 * Root cause of the observed reset: the selected product network lived in
 * route-local React state inside `App` (rendered by `/` and `/trade`). Leaving
 * Trade unmounted that component, so returning to Trade re-ran the
 * `useState(true)` initializer and re-applied BOT Mainnet 677.
 *
 * This store lives at MODULE scope, above every route, so a route remount can
 * never recreate or reset it. It is deliberately in-memory only: a genuine
 * browser reload starts a new runtime and therefore returns to the 677 default,
 * exactly as required. No storage, no persistence.
 *
 * Presentation/state only — no addresses, amounts, signing, ordering,
 * verification or settlement behavior lives here.
 */
import { useSyncExternalStore } from "react";

export const BOT_MAINNET = 677;
export const BOT_TESTNET = 968;

export type NetworkSelectionSource = "DEFAULT" | "USER" | "ACTION_INTENT" | "ROUTE";

export interface NetworkSessionState {
  selectedChainId: number;
  source: NetworkSelectionSource;
  initializedAt: string;
  changedAt: string;
}

const initialAt = new Date().toISOString();

let state: NetworkSessionState = {
  selectedChainId: BOT_MAINNET,
  source: "DEFAULT",
  initializedAt: initialAt,
  changedAt: initialAt,
};

const listeners = new Set<() => void>();

/** Route/intent hints are applied at most once per runtime, per hint key. */
const appliedHints = new Set<string>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getNetworkSession(): NetworkSessionState {
  return state;
}

export function isMainnetChainId(chainId: number): boolean {
  return chainId === BOT_MAINNET || chainId === 56 || chainId === 1;
}

/** Canonical setter. Every writer in the app goes through this one function. */
export function setSelectedChainId(chainId: number, source: NetworkSelectionSource = "USER") {
  if (state.selectedChainId === chainId && state.source === source) return;
  state = { ...state, selectedChainId: chainId, source, changedAt: new Date().toISOString() };
  emit();
}

/** Convenience mirror of the legacy boolean the workspace is written against. */
export function setMainnetSelected(isMainnet: boolean, source: NetworkSelectionSource = "USER") {
  setSelectedChainId(isMainnet ? BOT_MAINNET : BOT_TESTNET, source);
}

/**
 * Applies an explicit navigation/ActionIntent target once per runtime. Returning
 * to Trade later never re-applies a stale URL hint over a deliberate user
 * selection.
 */
export function applyExplicitChainTarget(input: {
  chainId: number;
  hintKey: string;
  source: Exclude<NetworkSelectionSource, "DEFAULT" | "USER">;
}): boolean {
  if (appliedHints.has(input.hintKey)) return false;
  appliedHints.add(input.hintKey);
  setSelectedChainId(isMainnetChainId(input.chainId) ? BOT_MAINNET : BOT_TESTNET, input.source);
  return true;
}

/** Test-only reset; never called from product code. */
export function __resetNetworkSessionForTests() {
  const at = new Date().toISOString();
  state = { selectedChainId: BOT_MAINNET, source: "DEFAULT", initializedAt: at, changedAt: at };
  appliedHints.clear();
  emit();
}

export function useNetworkSession(): NetworkSessionState {
  return useSyncExternalStore(subscribe, getNetworkSession, getNetworkSession);
}

/** `[isMainnet, setIsMainnet]` shaped for the existing workspace call sites. */
export function useSelectedNetwork(): [boolean, (next: boolean, source?: NetworkSelectionSource) => void] {
  const session = useNetworkSession();
  return [isMainnetChainId(session.selectedChainId), setMainnetSelected];
}
