/**
 * FlowBridge V27 §9 — one shared read of the in-app notification centre.
 *
 * Reuses the existing V25 decision feed and the canonical V17.1B reward state:
 * no new endpoint, no new poll, no economic write.
 */
import { useCallback, useMemo, useState } from "react";
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

  const candidates = useMemo(
    () => deriveNotifications({ signedIn, rewardState, decision }),
    [signedIn, rewardState, decision],
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
