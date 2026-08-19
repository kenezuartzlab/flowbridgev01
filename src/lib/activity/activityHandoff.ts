/**
 * Gate 5A2 — browser side of the trusted verification handoff.
 *
 * Sends ONLY signed attribution evidence (intent, signature, intentHash,
 * sourceTxHash). It never sends amounts-as-fact, log indexes, activity ids,
 * status, reward facts, campaign/task/completion ids or points, and a failed
 * handoff NEVER resends or reverses the bridge transaction.
 */
import type { ActivityIntent, Hex } from './activityIntent';

export const ACTIVITY_VERIFY_ENDPOINT = '/api/public/activity/verify';
export const SWAP_ACTIVITY_VERIFY_ENDPOINT = '/api/public/activity/verify-swap';
export const HANDOFF_MAX_ATTEMPTS = 12;
export const HANDOFF_RETRY_DELAY_MS = 10_000;

export interface SignedAttribution {
  intent: ActivityIntent;
  signature: Hex;
  intentHash: Hex;
}

export function serializeActivityVerifyBody(
  attribution: SignedAttribution,
  sourceTxHash: Hex,
) {
  const i = attribution.intent;
  return {
    intent: {
      intentId: i.intentId,
      user: i.user,
      actionType: i.actionType,
      sourceChainId: i.sourceChainId.toString(),
      destinationChainId: i.destinationChainId.toString(),
      token: i.token,
      amount: i.amount.toString(),
      recipient: i.recipient,
      campaignId: i.campaignId,
      nonce: i.nonce.toString(),
      deadline: i.deadline.toString(),
    },
    signature: attribution.signature,
    intentHash: attribution.intentHash,
    sourceTxHash,
  };
}

export type HandoffResult =
  | { outcome: 'CONFIRMED' | 'REJECTED' | 'REVIEW' | 'PENDING'; attempts: number }
  | { outcome: 'UNCONFIGURED' | 'FAILED'; attempts: number };

export interface HandoffDeps {
  /** Trusted verification endpoint. Defaults to the bridge verifier. */
  endpoint?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
  delayMs?: number;
}

/**
 * Bounded retry: PENDING and transient 429/5xx are retried up to 12 attempts,
 * 10s apart. REJECTED/REVIEW stop immediately. 503 (missing runtime config)
 * is NOT retried because it cannot self-heal.
 */
export async function submitActivityVerification(
  attribution: SignedAttribution,
  sourceTxHash: Hex,
  deps: HandoffDeps = {},
): Promise<HandoffResult> {
  const doFetch = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxAttempts = deps.maxAttempts ?? HANDOFF_MAX_ATTEMPTS;
  const delayMs = deps.delayMs ?? HANDOFF_RETRY_DELAY_MS;
  const body = JSON.stringify(serializeActivityVerifyBody(attribution, sourceTxHash));

  let attempts = 0;
  let last: HandoffResult = { outcome: 'FAILED', attempts: 0 };

  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      const res = await doFetch(deps.endpoint ?? ACTIVITY_VERIFY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      if (res.status === 503) return { outcome: 'UNCONFIGURED', attempts };
      if (res.status === 400) return { outcome: 'REJECTED', attempts };

      if (res.status === 429 || res.status >= 500) {
        last = { outcome: 'FAILED', attempts };
      } else {
        const json = (await res.json().catch(() => null)) as { status?: string } | null;
        const status = json?.status;
        if (status === 'CONFIRMED') return { outcome: 'CONFIRMED', attempts };
        if (status === 'REJECTED') return { outcome: 'REJECTED', attempts };
        if (status === 'REVIEW') return { outcome: 'REVIEW', attempts };
        last = { outcome: 'PENDING', attempts };
      }
    } catch {
      last = { outcome: 'FAILED', attempts };
    }
    if (attempts < maxAttempts) await sleep(delayMs);
  }
  return last;
}

// ---------------------------------------------------------------------------
// Local evidence persistence + read-after-write (attribution only)
// ---------------------------------------------------------------------------

const STORE_KEY = 'flowbridge.activityAttribution.v1';

const store = () => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

export function persistSignedAttribution(attribution: SignedAttribution): boolean {
  const s = store();
  if (!s) return false;
  try {
    const payload = JSON.stringify(serializeActivityVerifyBody(attribution, `0x${'00'.repeat(32)}` as Hex));
    const map = JSON.parse(s.getItem(STORE_KEY) ?? '{}') as Record<string, unknown>;
    map[attribution.intentHash.toLowerCase()] = JSON.parse(payload);
    s.setItem(STORE_KEY, JSON.stringify(map));
    // Read-after-write: only a successful readback counts as persisted.
    const back = JSON.parse(s.getItem(STORE_KEY) ?? '{}') as Record<string, unknown>;
    return !!back[attribution.intentHash.toLowerCase()];
  } catch {
    return false;
  }
}

/** Required-attribution mode: VITE_REQUIRE_ACTIVITY_ATTRIBUTION ("true"/"1"). */
export function isAttributionRequired(): boolean {
  const raw = import.meta.env.VITE_REQUIRE_ACTIVITY_ATTRIBUTION;
  if (typeof raw !== 'string') return false;
  const v = raw.trim().toLowerCase();
  return v === 'true' || v === '1';
}

/**
 * V8 — same bounded handoff, aimed at the verified swap endpoint. The payload is
 * identical signed attribution evidence: router, token and chain stay server-owned.
 */
export async function submitSwapActivityVerification(
  attribution: SignedAttribution,
  sourceTxHash: Hex,
  deps: HandoffDeps = {},
): Promise<HandoffResult> {
  return await submitActivityVerification(attribution, sourceTxHash, {
    ...deps,
    endpoint: deps.endpoint ?? SWAP_ACTIVITY_VERIFY_ENDPOINT,
  });
}
