/**
 * B1 Gate 2 — read-only Campaign Center data hook.
 * Guests get published definitions; signed-in users additionally get
 * server-bound wallet progress and Campaign PTS (never FLOW).
 */
import { useCallback, useEffect, useState } from 'react';
import { getIdToken, initAuth } from '@/lib/auth';
import {
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
      const token = user ? await getIdToken() : null;
      setData(await fetchCampaigns(token));
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
    campaigns: data?.campaigns ?? [],
    wallet: data?.wallet ?? null,
    authenticated: !!data?.authenticated,
    campaignPointsTotal: data?.campaignPointsTotal ?? 0,
    progressFor,
    refresh,
  };
}
