/**
 * FlowBridge V17.1B §2/§8 — client access to the canonical reward state.
 * Surfaces render these stages verbatim; they never recompute claimability.
 */
import { useCallback, useEffect, useState } from "react";
import type { RewardState } from "./rewardStateTruth";

export interface RewardStateClient extends RewardState {
  walletAddress: string | null;
  distributor: string | null;
  blockNumber: number | null;
}

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

export async function fetchRewardState(chainId?: number | null): Promise<RewardStateClient | null> {
  const qs = chainId ? `?chainId=${chainId}` : "";
  const res = await fetch(`/api/rewards/state${qs}`, { headers: await authHeaders() });
  if (!res.ok) return null;
  const json: any = await res.json();
  return (json?.rewardState as RewardStateClient) ?? null;
}

export async function convertFlowPoints(input: {
  expectedConvertibleFlowPoints: number;
  chainId?: number | null;
}): Promise<{ ok: boolean; error?: string; code?: string; rewardState?: RewardStateClient }> {
  const res = await fetch("/api/rewards/convert", {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ confirm: true, ...input }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: json?.error, code: json?.code, rewardState: json?.rewardState };
  return { ok: true, rewardState: json?.rewardState };
}

export function useRewardState(enabled: boolean, chainId?: number | null) {
  const [state, setState] = useState<RewardStateClient | null>(null);
  const [loading, setLoading] = useState(enabled);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setState(await fetchRewardState(chainId));
    } finally {
      setLoading(false);
    }
  }, [enabled, chainId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { rewardState: state, loading, refresh };
}
