/**
 * FlowBridge V25 §3/§9 — one shared read of the frozen V22 decision result.
 *
 * Home, the assistant's quick prompts and any other surface all consume THIS
 * hook, so the same recommendation can never be fetched twice or rendered in two
 * competing modules. Read-only: it issues one GET and mutates nothing economic.
 */
import { useCallback, useEffect, useState } from "react";
import { assistantFetch } from "@/lib/ai/assistantClient";
import { supabase } from "@/integrations/supabase/client";
import type { DecisionResult } from "@/lib/ai/decision/decisionTypes";

const CACHE_TTL_MS = 20_000;

let cache: { at: number; decision: DecisionResult | null; signedIn: boolean } | null = null;
let inflight: Promise<{ decision: DecisionResult | null; signedIn: boolean }> | null = null;

async function read(): Promise<{ decision: DecisionResult | null; signedIn: boolean }> {
  let signedIn = false;
  try {
    const { data } = await supabase.auth.getSession();
    signedIn = !!data.session?.user;
  } catch {
    signedIn = false;
  }
  try {
    const res = await assistantFetch("/api/ai/decision?limit=3");
    const json = await res.json();
    return { decision: (json?.decision as DecisionResult) ?? null, signedIn };
  } catch {
    return { decision: null, signedIn };
  }
}

export function invalidateDecisionFeed() {
  cache = null;
}

export function useDecisionFeed() {
  const [state, setState] = useState<{ decision: DecisionResult | null; signedIn: boolean } | null>(
    cache && Date.now() - cache.at < CACHE_TTL_MS ? cache : null,
  );
  const [loading, setLoading] = useState(!state);

  const load = useCallback(async (force = false) => {
    if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
      setState(cache);
      setLoading(false);
      return;
    }
    setLoading(true);
    if (!inflight || force) {
      inflight = read().finally(() => {
        inflight = null;
      });
    }
    const next = await inflight;
    cache = { at: Date.now(), ...next };
    setState(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  return {
    decision: state?.decision ?? null,
    signedIn: state?.signedIn ?? false,
    loading,
    refresh: () => load(true),
  };
}
