/**
 * V15.3F — shared Flow AI conversation types.
 *
 * Extracted from `AssistantChat` so the persistent conversation store can hold a
 * transcript without importing a React component. Types only.
 */
import type { PreparedIntentPayload } from "@/components/assistant/ActionIntentCard";
import type { ReviewAction } from "./actionRender";

export interface EvidenceRef {
  id: string;
  label: string;
  group: string;
  freshness: string;
  observedAt: string;
  /** V15.3A — per-source freshness: read live this request, or cached. */
  liveness?: "LIVE" | "CACHED";
  fetchedAt?: string;
  url?: string;
  excerpt?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  mode?: string;
  confidenceLabel?: string;
  asOf?: string | null;
  notice?: string | null;
  skills?: string[];
  evidence?: EvidenceRef[];
  hasLiveEvidence?: boolean;
  actionPreparation?: boolean;
  /** V15.2 — server-prepared, never-executed action plan. */
  prepared?: PreparedIntentPayload | null;
  /** V15.3H §1 — structured CTA descriptor; the UI renders it, prose never does. */
  reviewAction?: ReviewAction | null;
  /** V15.3H §2 — READY_FOR_USER arrived but could not be rendered as a card. */
  renderFailed?: boolean;
  preparationError?: string | null;
}
