/**
 * V15.3J §3/§7 — handoff resolution semantics.
 *
 * A deep link is a POINTER: `intent` (opaque id) plus non-authoritative integrity
 * hints (`fp` digest, `exp`). The canonical prepared snapshot is resolved from
 * server/session authority and classified here, so Trade can tell the user the
 * truth instead of collapsing every problem into "MALFORMED":
 *
 *   RESOLVED  — canonical snapshot found, owned, fresh, digest matches
 *   MISSING   — no such intent for this user (never prepared, or already cleared)
 *   EXPIRED   — structurally valid but past its 90s READY_FOR_USER lifetime
 *   TAMPERED  — link digest does not match the stored canonical object
 *   MALFORMED — the STORED canonical object itself violates the schema
 *
 * Pure module: no network, no DB, no keys, no authority.
 */
import {
  canonicalPreparedIntentSchema,
  type CanonicalPreparedIntent,
} from "./canonicalIntent";

export const HANDOFF_RESOLUTION_STATUSES = [
  "RESOLVED",
  "MISSING",
  "EXPIRED",
  "TAMPERED",
  "MALFORMED",
  "UNAUTHENTICATED",
  "UNAVAILABLE",
] as const;
export type HandoffResolutionStatus = (typeof HANDOFF_RESOLUTION_STATUSES)[number];

export interface HandoffResolution {
  status: HandoffResolutionStatus;
  canonical: CanonicalPreparedIntent | null;
  message: string;
}

export const HANDOFF_RESOLUTION_COPY: Record<HandoffResolutionStatus, string> = {
  RESOLVED:
    "Flow AI prepared this plan. Trade re-reads route, balance, allowance, live fee and quote before your wallet can sign.",
  MISSING:
    "That prepared plan is no longer available on this account, so Trade did not prefill anything. Ask Flow AI to prepare it again.",
  EXPIRED: "Preparation expired — re-prepare. Trade will not reuse a stale simulation.",
  TAMPERED:
    "The handoff link does not match the plan Flow AI prepared, so Trade ignored it. Ask Flow AI for a fresh preparation.",
  MALFORMED: "The stored plan failed validation, so Trade refused to use it. Ask Flow AI to prepare it again.",
  UNAUTHENTICATED: "Sign in to review the plan Flow AI prepared for your account.",
  UNAVAILABLE: "Trade could not reach the preparation service, so nothing was prefilled. Try again in a moment.",
};

function copy(status: HandoffResolutionStatus): string {
  return HANDOFF_RESOLUTION_COPY[status];
}

/**
 * §3/§7 — classification order matters: schema first (only that is MALFORMED),
 * then ownership/digest, then expiry.
 */
export function classifyResolution(input: {
  stored: unknown;
  digestHint?: string | null;
  expectedChainId?: number | null;
  now?: Date;
}): HandoffResolution {
  if (input.stored === null || input.stored === undefined) {
    return { status: "MISSING", canonical: null, message: copy("MISSING") };
  }
  const parsed = canonicalPreparedIntentSchema.safeParse(input.stored);
  if (!parsed.success) {
    return { status: "MALFORMED", canonical: null, message: copy("MALFORMED") };
  }
  const canonical = parsed.data;
  const hint = (input.digestHint ?? "").toLowerCase();
  if (hint && hint !== canonical.digest.toLowerCase()) {
    return { status: "TAMPERED", canonical: null, message: copy("TAMPERED") };
  }
  const now = input.now ?? new Date();
  if (new Date(canonical.expiresAt).getTime() <= now.getTime()) {
    return { status: "EXPIRED", canonical, message: copy("EXPIRED") };
  }
  return { status: "RESOLVED", canonical, message: copy("RESOLVED") };
}

/** Only a RESOLVED snapshot may hydrate the form; nothing here permits signing. */
export function mayHydrate(resolution: HandoffResolution): boolean {
  return resolution.status === "RESOLVED" && resolution.canonical !== null;
}
