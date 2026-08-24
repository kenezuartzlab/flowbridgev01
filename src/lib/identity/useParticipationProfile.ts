/**
 * FlowBridge V29 §2 — one shared read of the caller's participation profile.
 * Read-only: it fetches verified facts and derives presentation. It never
 * creates a Mission, an ActionIntent, a reward or a transaction.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { initAuth, type AppUser } from "@/lib/auth";
import {
  EMPTY_PARTICIPATION_FACTS,
  resolveParticipation,
  type ParticipationFacts,
  type ParticipationView,
} from "./participationProfile";
import { resolveAchievements, type AchievementsView } from "./achievements";

async function authHeaders(): Promise<Record<string, string>> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export async function fetchParticipationFacts(): Promise<ParticipationFacts | null> {
  const res = await fetch("/api/profile/participation", { headers: await authHeaders() });
  if (!res.ok) return null;
  const json: any = await res.json().catch(() => ({}));
  return (json?.facts as ParticipationFacts) ?? null;
}

export interface UseParticipationProfile {
  facts: ParticipationFacts;
  view: ParticipationView;
  achievements: AchievementsView;
  loading: boolean;
  signedIn: boolean;
  displayName: string | null;
  refresh: () => Promise<void>;
}

export function useParticipationProfile(): UseParticipationProfile {
  const [user, setUser] = useState<AppUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [facts, setFacts] = useState<ParticipationFacts | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = initAuth(
      (u) => {
        setUser(u);
        setAuthReady(true);
      },
      () => {
        setUser(null);
        setAuthReady(true);
      },
    );
    return () => unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    if (!user) {
      setFacts(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setFacts(await fetchParticipationFacts());
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authReady) return;
    void refresh();
  }, [authReady, refresh]);

  const displayName = useMemo(() => {
    const n = (user as any)?.displayName || (user as any)?.name || null;
    return typeof n === "string" && n.trim() ? n.trim() : null;
  }, [user]);

  const resolvedFacts = useMemo<ParticipationFacts>(
    () => facts ?? { ...EMPTY_PARTICIPATION_FACTS, signedIn: false },
    [facts],
  );

  return {
    facts: resolvedFacts,
    view: useMemo(() => resolveParticipation(resolvedFacts), [resolvedFacts]),
    achievements: useMemo(() => resolveAchievements(resolvedFacts), [resolvedFacts]),
    loading: !authReady || (!!user && loading),
    signedIn: !!user,
    displayName,
    refresh,
  };
}
