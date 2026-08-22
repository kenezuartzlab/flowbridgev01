/**
 * V15.3J §3 — server authority for prepared ActionIntents.
 *
 * The canonical snapshot is written HERE, once, right after the intent reaches
 * READY_FOR_USER, and is afterwards only ever read back by opaque id for the
 * OWNING user. That makes the handoff immune to query-string truncation, router
 * re-serialization and client-state loss — the failure mode V15.3J fixes.
 *
 * Storage is server-side (service role); a caller can never write a snapshot or
 * read another user's snapshot. Nothing stored here grants execution authority:
 * Trade revalidates every value and only the user's own wallet signs.
 */
import type { ActionIntent } from "./actionIntent";
import {
  canonicalAuditFields,
  normalizePreparedIntent,
  type CanonicalPreparedIntent,
} from "./canonicalIntent";
import { classifyResolution, type HandoffResolution } from "./handoffResolution";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type PersistResult =
  | { ok: true; canonical: CanonicalPreparedIntent; persisted: boolean }
  | { ok: false; errors: string[] };

/**
 * §2/§4 — normalize then persist. If normalization fails the caller MUST NOT
 * advertise READY_FOR_USER: a card Trade cannot consume is worse than none.
 */
export async function persistPreparedIntent(input: {
  intent: ActionIntent;
  userId: string | null;
}): Promise<PersistResult> {
  const normalized = normalizePreparedIntent(input.intent);
  if (!normalized.ok) return { ok: false, errors: normalized.errors };
  const canonical = normalized.canonical;

  if (!input.userId) {
    // Anonymous callers never reach on-chain preparation; keep the canonical
    // object in the response only, with no server row to resolve later.
    return { ok: true, canonical, persisted: false };
  }

  try {
    const db = await admin();
    const { error } = await db.from("ai_action_intents").upsert(
      {
        id: canonical.intentId,
        user_id: input.userId,
        schema_version: canonical.schemaVersion,
        intent_type: canonical.type,
        chain_id: canonical.chainId,
        digest: canonical.digest,
        canonical: JSON.parse(JSON.stringify(canonical)),
        expires_at: canonical.expiresAt,
      },
      { onConflict: "id" },
    );
    if (error) {
      console.error("[flow-ai] canonical intent persist failed", error.message, canonicalAuditFields(canonical));
      return { ok: true, canonical, persisted: false };
    }
    console.info("[flow-ai] canonical intent stored", canonicalAuditFields(canonical));
    return { ok: true, canonical, persisted: true };
  } catch (e) {
    console.error("[flow-ai] canonical intent persist threw", e);
    return { ok: true, canonical, persisted: false };
  }
}

/**
 * §3 — resolve an opaque intent id for the owning user. Ownership is enforced by
 * the query itself, so a leaked link cannot expose another account's plan.
 */
export async function resolvePreparedIntentForUser(input: {
  intentId: string;
  userId: string;
  digestHint?: string | null;
  now?: Date;
}): Promise<HandoffResolution> {
  try {
    const db = await admin();
    const { data, error } = await db
      .from("ai_action_intents")
      .select("canonical")
      .eq("id", input.intentId)
      .eq("user_id", input.userId)
      .maybeSingle();
    if (error) {
      return {
        status: "UNAVAILABLE",
        canonical: null,
        message: "Trade could not reach the preparation service, so nothing was prefilled.",
      };
    }
    return classifyResolution({
      stored: (data as any)?.canonical ?? null,
      digestHint: input.digestHint ?? null,
      now: input.now,
    });
  } catch {
    return {
      status: "UNAVAILABLE",
      canonical: null,
      message: "Trade could not reach the preparation service, so nothing was prefilled.",
    };
  }
}
