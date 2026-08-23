/**
 * FlowBridge V17 §7 — server authority for mission persistence.
 *
 * Missions are written and read ONLY here, with the service role, always scoped
 * to the owning user. A caller can never write a mission row, never read another
 * user's mission, and nothing stored here grants execution authority: every
 * economic step still re-enters the V15.3 ActionIntent pipeline and only the
 * user's own wallet can sign.
 */
import type { Mission } from "./missionTypes";
import { missionExpired } from "./missionTypes";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function toRow(mission: Mission) {
  return {
    id: mission.id,
    user_id: mission.actorUserId,
    schema_version: mission.schemaVersion,
    goal_text: mission.goalText,
    status: mission.status,
    mission: JSON.parse(JSON.stringify(mission)) as any,
    current_step_id: mission.currentStepId,
    version: mission.version,
    expires_at: mission.expiresAt,
    updated_at: mission.updatedAt,
    completed_at: mission.status === "COMPLETED" ? (mission.completedAt ?? mission.updatedAt) : null,
  };
}

/**
 * V17.1F §2/§7 — persistence is append-only for terminal missions.
 *
 * A COMPLETED row is never deleted, cleared, downgraded or recycled: a retried
 * settlement observer, remount or duplicate callback writes the SAME record.
 */
export async function saveMission(mission: Mission): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = await admin();
    const { data: existing } = await db
      .from("ai_missions")
      .select("status,completed_at,mission")
      .eq("id", mission.id)
      .eq("user_id", mission.actorUserId)
      .maybeSingle();

    if ((existing as any)?.status === "COMPLETED") {
      const stored = (existing as any).mission as Mission | undefined;
      if (mission.status !== "COMPLETED") {
        // Idempotent terminalization: never regress persisted history.
        return { ok: true };
      }
      const completedAt =
        (existing as any).completed_at ?? stored?.completedAt ?? mission.completedAt ?? mission.updatedAt;
      const row = toRow({ ...mission, completedAt });
      const { error } = await db.from("ai_missions").upsert(row, { onConflict: "id" });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }

    const { error } = await db.from("ai_missions").upsert(toRow(mission), { onConflict: "id" });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "mission persist failed" };
  }
}

/**
 * V17.1F §4/§5 — a COMPLETED mission is history: it never expires away and its
 * completion timestamp is hydrated from the persisted column when the embedded
 * document predates V17.1F.
 */
function hydrate(mission: Mission, completedAt?: string | null): Mission {
  const withCompletion: Mission =
    mission.status === "COMPLETED"
      ? { ...mission, completedAt: mission.completedAt ?? completedAt ?? mission.updatedAt }
      : mission;
  if (withCompletion.status === "COMPLETED" || withCompletion.status === "CANCELLED") {
    return withCompletion;
  }
  return missionExpired(withCompletion) ? { ...withCompletion, status: "EXPIRED" } : withCompletion;
}

/** Fails closed: a mission is returned only to its owner. */
export async function loadMission(input: {
  id: string;
  userId: string;
}): Promise<Mission | null> {
  try {
    const db = await admin();
    const { data } = await db
      .from("ai_missions")
      .select("mission,user_id,completed_at")
      .eq("id", input.id)
      .eq("user_id", input.userId)
      .maybeSingle();
    const mission = (data as any)?.mission as Mission | undefined;
    if (!mission) return null;
    return hydrate(mission, (data as any)?.completed_at ?? null);
  } catch {
    return null;
  }
}

export async function listMissions(input: {
  userId: string;
  limit?: number;
}): Promise<readonly Mission[]> {
  try {
    const db = await admin();
    const { data } = await db
      .from("ai_missions")
      .select("mission,completed_at")
      .eq("user_id", input.userId)
      .order("updated_at", { ascending: false })
      .limit(Math.min(50, Math.max(1, input.limit ?? 20)));
    return ((data ?? []) as any[])
      .filter((r) => r.mission)
      .map((r) => hydrate(r.mission as Mission, r.completed_at ?? null));
  } catch {
    return [];
  }
}
