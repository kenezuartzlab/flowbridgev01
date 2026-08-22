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

export interface ConversationState {
  conversationId: string;
  ownerKey: string;
  messages: ChatMessage[];
  pending: PendingPreparationRef | null;
  prepared: PreparedHandleRef | null;
  /** Intent id most recently handed off to a product surface (correlation only). */
  handedOffIntentId: string | null;
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

export function resetConversation(): void {
  commit(emptyState(state.ownerKey));
}

/** Drops an expired prepared handle so a stale review card is never continued. */
export function pruneExpiredPreparation(now: Date = new Date()): void {
  const p = state.prepared;
  if (!p) return;
  if (new Date(p.expiresAt).getTime() <= now.getTime()) {
    commit({ ...state, prepared: null });
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
