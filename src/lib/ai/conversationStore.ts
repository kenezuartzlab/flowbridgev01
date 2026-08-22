/**
 * V15.3F §3 — active Flow AI conversation continuity.
 *
 * Root cause of the lost transcript: `AssistantChat` held messages, the pending
 * preparation slot and the prepared handle in component state. Navigating
 * Assistant → Trade → Home unmounted the component, so returning to /assistant
 * mounted a brand-new empty chat and the review card was gone.
 *
 * This store lives at MODULE scope (above every route), mirrored into
 * `sessionStorage` so it also survives the in-app browser's occasional document
 * reload, and is keyed by an owner key derived from the signed-in user. Changing
 * owner (sign in / sign out / different account) wipes the transcript, so a
 * transcript can never be shown to another user in the same browser session.
 *
 * It is conversation continuity only — separate from long-term `ai_user_memory`,
 * which stays server-side and authenticated. Nothing here is authoritative: the
 * prepared handle remains a hint, and every economic value is re-resolved by the
 * product surface before signing.
 */
import { useSyncExternalStore } from "react";
import type { ChatMessage } from "./conversationTypes";
import type { ActionRenderStatus } from "./actionRender";

export interface PendingPreparationRef {
  type: string;
  chainId: number;
  tokenInSymbol: string | null;
  tokenOutSymbol: string | null;
  destinationChainId: number | null;
  missingFields: string[];
  recognized: string[];
  createdAt: string;
  expiresAt: string;
  actorKey: string;
}

export interface PreparedHandleRef {
  intentId: string;
  type: string;
  chainId: number;
  state: string;
  expiresAt: string;
  handoffHref: string | null;
  handoffCta: string | null;
  surface: string | null;
  actorKey: string;
}

/**
 * V15.3G §6 — a product surface may report back what happened to a prepared
 * plan. It is an OBSERVATION, never an authorization: it carries no calldata and
 * grants nothing. Flow AI reads it to explain the failure and offer to prepare
 * the action again instead of pretending the handoff succeeded.
 */
export interface ConversationObservation {
  code: "HANDOFF_HYDRATION_FAILED" | "HANDOFF_HYDRATED";
  surface: string;
  detail: string;
  intentId: string | null;
  at: string;
}

export interface ConversationState {
  conversationId: string;
  ownerKey: string;
  messages: ChatMessage[];
  pending: PendingPreparationRef | null;
  prepared: PreparedHandleRef | null;
  /** Intent id most recently handed off to a product surface (correlation only). */
  handedOffIntentId: string | null;
  /** V15.3G §5 — unsent composer text, so navigation cannot erase a draft. */
  composerDraft: string;
  /** V15.3G §6 — latest product-surface observation about the handoff. */
  observation: ConversationObservation | null;
  /**
   * V15.3H §2 — did the client actually RENDER the structured action card for the
   * active prepared plan? Flow AI reads this before ever mentioning a button.
   */
  renderStatus: ActionRenderStatus;
  updatedAt: string;
}


const STORAGE_KEY = "flowbridge_ai_conversation_v1";
const MAX_MESSAGES = 40;

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `conv_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
  }
}

function emptyState(ownerKey = "anonymous"): ConversationState {
  return {
    conversationId: newId(),
    ownerKey,
    messages: [],
    pending: null,
    prepared: null,
    handedOffIntentId: null,
    composerDraft: "",
    observation: null,
    renderStatus: "NONE",

    updatedAt: new Date().toISOString(),
  };
}

let state: ConversationState = (() => {
  if (typeof window === "undefined") return emptyState();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as ConversationState;
    if (!parsed?.conversationId || !Array.isArray(parsed.messages)) return emptyState();
    return { ...emptyState(parsed.ownerKey ?? "anonymous"), ...parsed };
  } catch {
    return emptyState();
  }
})();

const listeners = new Set<() => void>();

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* continuity is best-effort; never a gate */
  }
}

function commit(next: ConversationState) {
  state = { ...next, updatedAt: new Date().toISOString() };
  persist();
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getConversation(): ConversationState {
  return state;
}

/**
 * Fails closed on owner change: a transcript belonging to another account (or to
 * the signed-out session) is discarded rather than displayed.
 */
export function ensureConversationOwner(ownerKey: string): ConversationState {
  const key = ownerKey || "anonymous";
  if (state.ownerKey === key) return state;
  commit(emptyState(key));
  return state;
}

export function setConversationMessages(messages: ChatMessage[]): void {
  commit({ ...state, messages: messages.slice(-MAX_MESSAGES) });
}

export function updateConversationMessages(
  updater: (prev: ChatMessage[]) => ChatMessage[],
): ChatMessage[] {
  const next = updater(state.messages).slice(-MAX_MESSAGES);
  commit({ ...state, messages: next });
  return next;
}

export function setConversationPending(pending: PendingPreparationRef | null): void {
  commit({ ...state, pending });
}

export function setConversationPrepared(prepared: PreparedHandleRef | null): void {
  commit({ ...state, prepared });
}

export function markConversationHandoff(intentId: string): void {
  commit({ ...state, handedOffIntentId: intentId });
}

/** V15.3G §5 — unsent composer text survives SPA navigation. */
export function setConversationDraft(draft: string): void {
  const next = draft.slice(0, 2000);
  if (state.composerDraft === next) return;
  commit({ ...state, composerDraft: next });
}

/** V15.3G §6 — a product surface reports what happened to the prepared plan. */
export function recordConversationObservation(
  observation: Omit<ConversationObservation, "at"> & { at?: string },
): void {
  const next: ConversationObservation = {
    ...observation,
    at: observation.at ?? new Date().toISOString(),
  };
  const prev = state.observation;
  if (
    prev &&
    prev.code === next.code &&
    prev.surface === next.surface &&
    prev.detail === next.detail &&
    prev.intentId === next.intentId
  ) {
    return;
  }
  commit({ ...state, observation: next });
}

/**
 * V15.3H §2 — the UI reports whether the structured card actually rendered.
 * RENDER_FAILED is a first-class state: the assistant then says so instead of
 * telling the user to tap a control that does not exist.
 */
export function setConversationRenderStatus(status: ActionRenderStatus): void {
  if (state.renderStatus === status) return;
  commit({ ...state, renderStatus: status });
}

export function clearConversationObservation(): void {
  if (!state.observation) return;
  commit({ ...state, observation: null });
}


export function resetConversation(): void {
  commit(emptyState(state.ownerKey));
}

/** Drops an expired prepared handle so a stale review card is never continued. */
export function pruneExpiredPreparation(now: Date = new Date()): void {
  const p = state.prepared;
  if (!p) return;
  if (new Date(p.expiresAt).getTime() <= now.getTime()) {
    commit({ ...state, prepared: null, renderStatus: "NONE" });
  }
}

export function useConversation(): ConversationState {
  return useSyncExternalStore(subscribe, getConversation, getConversation);
}

/** Test-only reset; never called from product code. */
export function __resetConversationForTests() {
  state = emptyState();
  for (const l of listeners) l();
}
