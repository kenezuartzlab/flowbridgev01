/**
 * FlowBridge V27 §9 — one shared read of the in-app notification centre.
 *
 * Reuses the existing V25 decision feed and the canonical V17.1B reward state:
 * no new endpoint, no new poll, no economic write.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDecisionFeed } from "@/lib/ai/experience/useDecisionFeed";
import { useRewardState } from "@/lib/rewards/useRewardState";
import { deriveNotifications, unreadCount, visibleNotifications } from "./notifications";
import {
  dismissNotification,
  markNotificationsSeen,
  readNotificationState,
  setGrowthNotificationsEnabled,
  snoozeNotification,
} from "./notificationState";

export function useNotifications() {
  const { decision, signedIn, loading } = useDecisionFeed();
  const { rewardState, loading: rewardLoading } = useRewardState(signedIn);
  const [state, setState] = useState(() => readNotificationState());
  /**
   * V28 §11 — verification state for the account-setup reminder. Read-only, and
   * the reminder disappears the moment the account is complete.
   */
  const [emailVerified, setEmailVerified] = useState<boolean | undefined>(undefined);
  const [walletBound, setWalletBound] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    if (!signedIn) {
      setEmailVerified(undefined);
      return;
    }
    let cancelled = false;
    void supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!cancelled) setEmailVerified(!!data.user?.email_confirmed_at);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  useEffect(() => {
    const wallet = rewardState?.requirements.find((r) => /wallet/i.test(r.label));
    setWalletBound(wallet ? wallet.met : undefined);
  }, [rewardState]);

  const candidates = useMemo(
    () => deriveNotifications({ signedIn, rewardState, decision, emailVerified, walletBound }),
    [signedIn, rewardState, decision, emailVerified, walletBound],
  );

  const items = useMemo(() => visibleNotifications(candidates, state), [candidates, state]);

  const dismiss = useCallback((id: string) => setState(dismissNotification(id)), []);
  const snooze = useCallback((id: string) => setState(snoozeNotification(id)), []);
  const markSeen = useCallback(
    (ids: readonly string[]) => {
      if (ids.length === 0) return;
      setState(markNotificationsSeen(ids));
    },
    [],
  );
  const setGrowthEnabled = useCallback(
    (enabled: boolean) => setState(setGrowthNotificationsEnabled(enabled)),
    [],
  );

  return {
    signedIn,
    loading: loading || (signedIn && rewardLoading && !rewardState),
    items,
    account: items.filter((n) => n.category === "ACCOUNT"),
    growth: items.filter((n) => n.category === "GROWTH"),
    unread: unreadCount(items, state),
    growthEnabled: state.growthEnabled,
    dismiss,
    snooze,
    markSeen,
    setGrowthEnabled,
  };
}
