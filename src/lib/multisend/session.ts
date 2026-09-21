/**
 * FlowBridge MultiSend V1 — source authorization queue and session persistence.
 *
 * Every source transaction a user authorizes is persisted the instant it
 * confirms, so a cancelled or failed later wallet can never lose an
 * already-confirmed result. A user can leave and resume a partially completed
 * session, and only failed / unsubmitted source groups can be retried.
 */
import type {
  Address,
  MultiSendPlan,
  MultiSendSession,
  SessionStatus,
  SourceReceipt,
  SourceStatus,
} from "./types";

const STORAGE_KEY = "fb.multisend.sessions.v1";
const MAX_STORED = 25;

export function newClientBatchId(): `0x${string}` {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 32; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
}

export function initialReceipts(plan: MultiSendPlan): SourceReceipt[] {
  return plan.sources.map((s) => ({
    source: s.source,
    status: "ready" as SourceStatus,
    recipientCount: s.recipients.length,
    recipientsTotal: s.recipientsTotal,
    serviceFee: s.serviceFee,
  }));
}

export function sessionStatus(receipts: SourceReceipt[]): SessionStatus {
  if (receipts.length === 0) return "draft";
  const confirmed = receipts.filter((r) => r.status === "confirmed").length;
  const settledBad = receipts.filter((r) => r.status === "failed" || r.status === "cancelled").length;
  const working = receipts.some((r) =>
    r.status === "awaiting-approval" || r.status === "awaiting-signature" || r.status === "submitted",
  );

  if (confirmed === receipts.length) return "completed";
  if (working) return "in-progress";
  if (confirmed > 0) return "partially-completed";
  if (settledBad === receipts.length) return settledBad > 0 && receipts.every((r) => r.status === "cancelled") ? "cancelled" : "failed";
  if (confirmed === 0 && settledBad === 0) return "ready";
  return "in-progress";
}

/** Index of the source that should sign next, or null when the queue is done. */
export function nextSignableIndex(receipts: SourceReceipt[]): number | null {
  const i = receipts.findIndex((r) => r.status === "ready" || r.status === "failed" || r.status === "awaiting-approval");
  return i === -1 ? null : i;
}

/** A confirmed source is never retried or re-signed. */
export function isRetryable(receipt: SourceReceipt): boolean {
  return receipt.status === "failed" || receipt.status === "cancelled" || receipt.status === "ready";
}

export function queueLabel(receipts: SourceReceipt[], index: number, nameFor?: (a: Address) => string): string {
  const r = receipts[index];
  const label = nameFor?.(r.source) ?? `${r.source.slice(0, 6)}…${r.source.slice(-4)}`;
  const status: Record<SourceStatus, string> = {
    draft: "Draft",
    ready: index === (nextSignableIndex(receipts) ?? -1) ? "Ready to sign" : "Waiting",
    "awaiting-approval": "Awaiting approval",
    "awaiting-signature": "Awaiting signature",
    submitted: "Submitted",
    confirmed: "Confirmed",
    failed: "Failed",
    cancelled: "Cancelled",
  };
  return `${index + 1} of ${receipts.length} · ${label} · ${status[r.status]}`;
}

// ---------------------------------------------------------------------------
// Persistence (browser only, per-device session history)
// ---------------------------------------------------------------------------

type StoredSession = Omit<MultiSendSession, "receipts"> & {
  receipts: (Omit<SourceReceipt, "recipientsTotal" | "serviceFee"> & {
    recipientsTotal: string;
    serviceFee: string;
  })[];
};

function encode(s: MultiSendSession): StoredSession {
  return {
    ...s,
    receipts: s.receipts.map((r) => ({
      ...r,
      recipientsTotal: r.recipientsTotal.toString(),
      serviceFee: r.serviceFee.toString(),
    })),
  };
}

function decode(s: StoredSession): MultiSendSession {
  return {
    ...s,
    receipts: s.receipts.map((r) => ({
      ...r,
      recipientsTotal: BigInt(r.recipientsTotal),
      serviceFee: BigInt(r.serviceFee),
    })),
  };
}

export function loadSessions(): MultiSendSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredSession[];
    return Array.isArray(parsed) ? parsed.map(decode) : [];
  } catch {
    return [];
  }
}

export function saveSession(session: MultiSendSession): void {
  if (typeof window === "undefined") return;
  try {
    const all = loadSessions().filter((s) => s.clientBatchId !== session.clientBatchId);
    all.unshift({ ...session, updatedAt: Date.now() });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(0, MAX_STORED).map(encode)));
  } catch {
    /* storage unavailable — the on-chain transactions remain the source of truth */
  }
}

export function resumableSession(chainId: number): MultiSendSession | null {
  return (
    loadSessions().find(
      (s) => s.chainId === chainId && ["in-progress", "partially-completed", "ready"].includes(sessionStatus(s.receipts)),
    ) ?? null
  );
}
