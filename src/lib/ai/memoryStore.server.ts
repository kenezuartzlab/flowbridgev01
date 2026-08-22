/**
 * V15.1 §7 — durable, scope-checked Flow AI memory.
 *
 * Every read/write is keyed to the SERVER-resolved actor. `ai_user_memory` is
 * fail-closed (RLS on, no client policies) so only this module can touch it.
 * Values pass the V15 secret filter in `writeMemory` before they are persisted,
 * and user corrections about product facts stay `promoted: false` candidates —
 * they never rewrite canonical knowledge.
 */
import type { FlowAiActor } from "./aiTypes";
import { writeMemory, type MemoryEntry } from "./memoryScopes";

export interface StoredMemory {
  key: string;
  value: string;
  origin: MemoryEntry["origin"];
  promoted: boolean;
  updatedAt: string;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Preferences the actor is allowed to read — own USER_PRIVATE rows only. */
export async function listUserMemory(actor: FlowAiActor): Promise<StoredMemory[]> {
  if (!actor.userId) return [];
  try {
    const db = await admin();
    const { data } = await db
      .from("ai_user_memory")
      .select("key,value,origin,promoted,updated_at")
      .eq("user_id", actor.userId)
      .eq("scope", "USER_PRIVATE")
      .order("updated_at", { ascending: false })
      .limit(20);
    return (data ?? []).map((r: any) => ({
      key: String(r.key),
      value: String(r.value),
      origin: r.origin,
      promoted: !!r.promoted,
      updatedAt: String(r.updated_at),
    }));
  } catch {
    return [];
  }
}

export type SaveMemoryResult =
  | { accepted: true; entry: StoredMemory }
  | { accepted: false; reason: string };

export async function saveUserMemory(input: {
  actor: FlowAiActor;
  key: string;
  value: string;
  origin?: MemoryEntry["origin"];
  optedIn: boolean;
}): Promise<SaveMemoryResult> {
  const validated = writeMemory({
    actor: input.actor,
    scope: "USER_PRIVATE",
    ownerId: input.actor.userId,
    key: input.key.trim().slice(0, 80),
    value: input.value,
    origin: input.origin ?? "USER_STATED",
    optedIn: input.optedIn,
  });
  if (!validated.accepted) return validated;

  const entry = validated.entry;
  try {
    const db = await admin();
    const { error } = await db.from("ai_user_memory").upsert(
      {
        user_id: input.actor.userId,
        scope: "USER_PRIVATE",
        key: entry.key,
        value: entry.value,
        // A user correction about a product fact is candidate feedback only.
        origin: entry.origin,
        promoted: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,scope,key" },
    );
    if (error) return { accepted: false, reason: "could not save that preference" };
  } catch {
    return { accepted: false, reason: "could not save that preference" };
  }

  return {
    accepted: true,
    entry: {
      key: entry.key,
      value: entry.value,
      origin: entry.origin,
      promoted: false,
      updatedAt: entry.createdAt,
    },
  };
}

/** Clears one key, or the actor's whole private memory when key is omitted. */
export async function clearUserMemory(actor: FlowAiActor, key?: string): Promise<number> {
  if (!actor.userId) return 0;
  try {
    const db = await admin();
    let q = db
      .from("ai_user_memory")
      .delete()
      .eq("user_id", actor.userId)
      .eq("scope", "USER_PRIVATE");
    if (key) q = q.eq("key", key);
    const { data } = await q.select("key");
    return (data ?? []).length;
  } catch {
    return 0;
  }
}

/** Compact, model-safe rendering of preferences for the prompt. */
export function renderMemoryForPrompt(entries: readonly StoredMemory[]): string | null {
  const usable = entries.filter((e) => e.origin !== "USER_CORRECTION");
  if (usable.length === 0) return null;
  return usable.map((e) => `${e.key}: ${e.value}`).join(" | ");
}
