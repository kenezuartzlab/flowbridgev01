import { useCallback, useEffect, useState } from "react";
import { initAuth, getIdToken } from "@/lib/auth";
import { fetchActivityHistory, fetchUserIncentives } from "@/lib/app/activityApi";

/**
 * Shared read-only account state for the Rewards / Activity pages.
 * Uses the exact same endpoints App.tsx uses, so no reward rules are
 * duplicated client-side (server stays the source of truth).
 */
export function useAccountData() {
  const [user, setUser] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);
  const [incentives, setIncentives] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = initAuth(
      (u) => { setUser(u); setAuthReady(true); },
      () => { setUser(null); setAuthReady(true); setLoading(false); },
    );
    return () => unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    const token = await getIdToken();
    if (!token) { setLoading(false); return; }
    setLoading(true);
    try {
      const [inc, txs] = await Promise.all([
        fetchUserIncentives(token),
        fetchActivityHistory(token),
      ]);
      setIncentives(inc);
      setTransactions(txs);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (!user) { setLoading(false); return; }
    void refresh();
  }, [authReady, user, refresh]);

  return { user, authReady, incentives, transactions, loading, refresh };
}
