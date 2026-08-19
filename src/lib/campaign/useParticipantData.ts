/**
 * Growth Hub V3 — read-only participant state (summary, completions, activity)
 * plus the public leaderboard. Wallet binding stays server-side.
 */
import { useCallback, useEffect, useState } from "react";
import { getIdToken, initAuth } from "@/lib/auth";
import {
  fetchLeaderboard,
  fetchParticipantMe,
  type LeaderboardEntry,
  type ParticipantMeResponse,
} from "./participantApi";

export function useParticipantData(leaderboardLimit = 25) {
  const [user, setUser] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);
  const [me, setMe] = useState<ParticipantMeResponse | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardTotal, setLeaderboardTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = initAuth(
      (u) => { setUser(u); setAuthReady(true); },
      () => { setUser(null); setAuthReady(true); },
    );
    return () => unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const board = await fetchLeaderboard(leaderboardLimit);
      setLeaderboard(board.rows);
      setLeaderboardTotal(board.total);

      const token = user ? await getIdToken() : null;
      setMe(token ? await fetchParticipantMe(token) : null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load participant data");
    } finally {
      setLoading(false);
    }
  }, [user, leaderboardLimit]);

  useEffect(() => {
    if (!authReady) return;
    void refresh();
  }, [authReady, refresh]);

  return {
    authReady,
    authenticated: !!user,
    loading,
    error,
    me,
    leaderboard,
    leaderboardTotal,
    refresh,
  };
}
