/**
 * V15.3J §3 — browser side of the server-resolved handoff.
 *
 * Trade sends the opaque intent id (and the link's digest hint) and receives the
 * canonical prepared snapshot for the signed-in owner. It resolves ONCE per intent
 * id; the result is a plan to prefill, never an authorization. Trade still
 * re-reads balance, allowance, live fee/nonce, quote and simulation itself, and
 * only the user's own wallet can sign.
 */
import { assistantFetch } from "./assistantClient";
import { canonicalPreparedIntentSchema } from "./canonicalIntent";
import {
  HANDOFF_RESOLUTION_COPY,
  HANDOFF_RESOLUTION_STATUSES,
  type HandoffResolution,
  type HandoffResolutionStatus,
} from "./handoffResolution";

export async function resolveHandoffIntent(input: {
  intentId: string;
  digest?: string | null;
}): Promise<HandoffResolution> {
  const params = new URLSearchParams({ intent: input.intentId });
  if (input.digest) params.set("fp", input.digest);
  try {
    const res = await assistantFetch(`/api/assistant/handoff?${params.toString()}`, {
      method: "GET",
    });
    if (res.status === 401) {
      return {
        status: "UNAUTHENTICATED",
        canonical: null,
        message: HANDOFF_RESOLUTION_COPY.UNAUTHENTICATED,
      };
    }
    const body = (await res.json().catch(() => ({}))) as {
      status?: string;
      canonical?: unknown;
      message?: string;
    };
    const status = (HANDOFF_RESOLUTION_STATUSES as readonly string[]).includes(body.status ?? "")
      ? (body.status as HandoffResolutionStatus)
      : "UNAVAILABLE";
    const parsed = canonicalPreparedIntentSchema.safeParse(body.canonical);
    return {
      status,
      canonical: status === "RESOLVED" && parsed.success ? parsed.data : null,
      message: body.message ?? HANDOFF_RESOLUTION_COPY[status],
    };
  } catch {
    return {
      status: "UNAVAILABLE",
      canonical: null,
      message: HANDOFF_RESOLUTION_COPY.UNAVAILABLE,
    };
  }
}
