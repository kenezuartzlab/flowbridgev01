/**
 * B1 Gate 2 — read-only Campaign Center data hook.
 * Guests get published definitions; signed-in users additionally get
 * server-bound wallet progress and Campaign PTS (never FLOW).
 *
 * V9.1: public discovery never depends on private participant auth. If the
 * authenticated read is rejected (401), we transparently fall back to the
 * public read so published campaigns still render, and expose that as
 * `progressUnavailable` instead of a page-level error.
 */
import { useCallback, useEffect, useState } from 'react';
import { getIdToken, initAuth } from '@/lib/auth';
import {
  CampaignApiUnauthorized,
  fetchCampaigns,
  type CampaignApiProgress,
  type CampaignApiResponse,
} from './campaignApi';

export function useCampaignProgress() {
  const [user, setUser] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);
  const [data, setData] = useState<CampaignApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progressUnavailable, setProgressUnavailable] = useState(false);

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
    setProgressUnavailable(false);
    try {
      const token = user ? await getIdToken() : null;
      try {
        setData(await fetchCampaigns(token));
      } catch (e) {
        if (!(e instanceof CampaignApiUnauthorized)) throw e;
        // Private progress is unavailable — public discovery must still work.
        setProgressUnavailable(true);
        setData(await fetchCampaigns(null));
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authReady) return;
    void refresh();
  }, [authReady, refresh]);

  const progressFor = useCallback(
    (campaignId: string): CampaignApiProgress | undefined =>
      data?.progress.find((p) => p.campaignId.toLowerCase() === campaignId.toLowerCase()),
    [data],
  );

  return {
    user,
    authReady,
    loading,
    error,
    /** True when the signed-in participant read failed auth but public data loaded. */
    progressUnavailable,
    campaigns: data?.campaigns ?? [],
    wallet: data?.wallet ?? null,
    authenticated: !!data?.authenticated,
    campaignPointsTotal: data?.campaignPointsTotal ?? 0,
    progressFor,
    refresh,
  };
}

