/**
 * FlowBridge V25 §3/§9 — one shared read of the frozen V22 decision result.
 *
 * Home, the assistant's quick prompts and any other surface all consume THIS
 * hook, so the same recommendation can never be fetched twice or rendered in two
 * competing modules. Read-only: it issues one GET and mutates nothing economic.
 *
 * V30 §3/§4/§6 hardening:
 * - A failed or unconfirmable read is reported as `error`, never as an empty
 *   feed, so the UI can offer Retry instead of implying "nothing to do".
 * - Already-resolved content stays on screen while a background refresh runs.
 */
import { useCallback, useEffect, useState } from "react";
import { assistantFetch } from "@/lib/ai/assistantClient";
import { supabase } from "@/integrations/supabase/client";
import type { DecisionResult } from "@/lib/ai/decision/decisionTypes";

const CACHE_TTL_MS = 20_000;

export interface DecisionFeedState {
  decision: DecisionResult | null;
  signedIn: boolean;
  /** True when the current data could not be confirmed. */
  error: boolean;
}

let cache: { at: number; state: DecisionFeedState } | null = null;
let inflight: Promise<DecisionFeedState> | null = null;

async function read(): Promise<DecisionFeedState> {
  let signedIn = false;
  try {
    const { data } = await supabase.auth.getSession();
    signedIn = !!data.session?.user;
  } catch {
    signedIn = false;
  }
  try {
    const res = await assistantFetch("/api/ai/decision?limit=3");
    if (!res.ok) return { decision: null, signedIn, error: true };
    const json = await res.json();
    const decision = (json?.decision as DecisionResult) ?? null;
    return { decision, signedIn, error: !decision };
  } catch {
    return { decision: null, signedIn, error: true };
  }
}

export function invalidateDecisionFeed() {
  cache = null;
}

export function useDecisionFeed() {
  const [state, setState] = useState<DecisionFeedState | null>(
    cache && Date.now() - cache.at < CACHE_TTL_MS ? cache.state : null,
  );
  const [loading, setLoading] = useState(!state);

  const load = useCallback(async (force = false) => {
    if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
      setState(cache.state);
      setLoading(false);
      return;
    }
    // Keep resolved content visible while re-reading (V30 §6).
    setState((prev) => {
      if (!prev) setLoading(true);
      return prev;
    });
    if (!inflight || force) {
      inflight = read().finally(() => {
        inflight = null;
      });
    }
    const next = await inflight;
    // A degraded later read must never erase a good earlier answer (V30 §4).
    setState((prev) => {
      const keep = next.error && prev?.decision ? { ...prev, error: true } : next;
      cache = { at: Date.now(), state: keep };
      return keep;
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    decision: state?.decision ?? null,
    signedIn: state?.signedIn ?? false,
    error: state?.error ?? false,
    loading,
    refresh: () => load(true),
  };
}
