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

let inflight: { token: string; p: Promise<PersonalProgressClient | null> } | null = null;

export async function fetchPersonalProgress(fresh = false): Promise<PersonalProgressClient | null> {
  const { supabase } = await import("@/integrations/supabase/client");
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) return null;
  if (!fresh && cache && cache.token === token && Date.now() - cache.at < TTL) return cache.data;
  // V36.1: dedupe concurrent callers (Home, Earn, Flow AI) into one request.
  if (!fresh && inflight && inflight.token === token) return inflight.p;
  const p = doFetch(token, fresh);
  inflight = { token, p };
  try { return await p; } finally { if (inflight?.p === p) inflight = null; }
}

async function doFetch(token: string, fresh: boolean): Promise<PersonalProgressClient | null> {
  const res = await fetch(`/api/rewards/progression${fresh ? "?fresh=1" : ""}`, { headers: { Authorization: `Bearer ${token}` } });
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
    const load = (fresh = false) => fetchPersonalProgress(fresh).then((d) => { if (!off) setData(d); }).catch(() => undefined).finally(() => { if (!off) setLoading(false); });
    void load();
    // V34.2: refresh after a successful bind without a page reload (bypasses server cache).
    const onBound = () => { cache = null; void load(true); };
    window.addEventListener("flowbridge:wallet-bound", onBound);
    return () => { off = true; window.removeEventListener("flowbridge:wallet-bound", onBound); };
  }, [enabled]);
  return { data, loading };
}
