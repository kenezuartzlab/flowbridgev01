/** V34 — client read of the caller's own server-derived progression. Render-only. */
import { useEffect, useState } from "react";
import type { RewardProgression } from "./rewardProgression";
import type { NextBestAction } from "@/lib/growth/nextBestAction";

export interface PersonalProgressClient {
  progression: RewardProgression;
  nextBestAction: NextBestAction;
  confirmedMainnetTrades: number;
  missionNextStep: { id: string; title: string; href: string } | null;
  chainReadable: boolean;
  observedAt: string;
}

let cache: { at: number; token: string; data: PersonalProgressClient | null } | null = null;
const TTL = 60_000;

export async function fetchPersonalProgress(): Promise<PersonalProgressClient | null> {
  const { supabase } = await import("@/integrations/supabase/client");
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) return null;
  if (cache && cache.token === token && Date.now() - cache.at < TTL) return cache.data;
  const res = await fetch("/api/rewards/progression", { headers: { Authorization: `Bearer ${token}` } });
  const json: any = res.ok ? await res.json().catch(() => null) : null;
  const data = json?.progression ? (json as PersonalProgressClient) : null;
  cache = { at: Date.now(), token, data };
  return data;
}

export function usePersonalProgress(enabled: boolean) {
  const [data, setData] = useState<PersonalProgressClient | null>(null);
  const [loading, setLoading] = useState(enabled);
  useEffect(() => {
    if (!enabled) { setData(null); setLoading(false); return; }
    let off = false;
    setLoading(true);
    const load = () => fetchPersonalProgress().then((d) => { if (!off) setData(d); }).catch(() => undefined).finally(() => { if (!off) setLoading(false); });
    void load();
    // V34.2: refresh after a successful bind without a page reload.
    const onBound = () => { cache = null; void load(); };
    window.addEventListener("flowbridge:wallet-bound", onBound);
    return () => { off = true; window.removeEventListener("flowbridge:wallet-bound", onBound); };
  }, [enabled]);
  return { data, loading };
}
