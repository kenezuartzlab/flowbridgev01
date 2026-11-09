/** Shared read-only live Vault V2 balance for the caller's bound wallet. */
import { useEffect, useState } from "react";
import type { Address } from "viem";
import { getIdToken } from "@/lib/auth";
import { readVaultV2 } from "./vaultV2Read";
import type { VaultV2Figures } from "./unifiedRewards";

export const REWARDS_REFRESH_EVENT = "flowbridge:rewards-refresh";
export const refreshRewards = () => window.dispatchEvent(new Event(REWARDS_REFRESH_EVENT));

type State = { enabled: boolean; figures: VaultV2Figures | undefined };
let cache: { wallet: string; at: number; p: Promise<State> } | null = null;

async function load(wallet: Address): Promise<State> {
  const token = await getIdToken();
  if (!token) return { enabled: false, figures: undefined };
  const res = await fetch("/api/rewards/vault-v2", { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("unavailable");
  const cfg = await res.json();
  if (!cfg.enabled) return { enabled: false, figures: null };
  const live = await readVaultV2(wallet, cfg);
  return { enabled: true, figures: live ? { claimableWei: live.claimable, claimedWei: live.claimed } : undefined };
}

export function useVaultV2Balance(wallet: string | null | undefined) {
  const [state, setState] = useState<State>({ enabled: false, figures: undefined });
  useEffect(() => {
    if (!wallet) { setState({ enabled: false, figures: undefined }); return; }
    let off = false;
    const run = (fresh: boolean) => {
      const w = wallet.toLowerCase();
      if (fresh || !cache || cache.wallet !== w || Date.now() - cache.at > 30_000) cache = { wallet: w, at: Date.now(), p: load(w as Address) };
      const mine = cache.p;
      // A failed read keeps V2 enabled-but-unknown so totals never show a false 0.
      mine.then((s) => { if (!off) setState(s); }).catch(() => { if (cache?.p === mine) cache = null; if (!off) setState({ enabled: true, figures: undefined }); });
    };
    run(false);
    const onRefresh = () => run(true);
    window.addEventListener(REWARDS_REFRESH_EVENT, onRefresh);
    return () => { off = true; window.removeEventListener(REWARDS_REFRESH_EVENT, onRefresh); };
  }, [wallet]);
  return state;
}
