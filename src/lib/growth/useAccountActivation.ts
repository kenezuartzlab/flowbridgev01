/**
 * FlowBridge V28 §3/§10 — one shared read of account activation state.
 *
 * Reuses the existing auth read, the canonical V17.1B reward state and the frozen
 * V22 decision result. No new source of truth, no new endpoint, no economic write.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { initAuth, reloadUser, sendVerification, type AppUser } from "@/lib/auth";
import { useDecisionFeed } from "@/lib/ai/experience/useDecisionFeed";
import { useRewardState } from "@/lib/rewards/useRewardState";
import { resolveActivation, type ActivationView } from "./accountActivation";
import { trackActivation } from "./activationAnalytics";

export interface UseAccountActivation {
  view: ActivationView;
  loading: boolean;
  signedIn: boolean;
  emailVerified: boolean;
  walletBound: boolean;
  email: string | null;
  /** Sends the account verification email. Never a wallet transaction. */
  sendVerificationEmail: () => Promise<{ ok: boolean; error?: string }>;
  /** Re-reads canonical state so a fresh verification is picked up at once. */
  refresh: () => Promise<void>;
}

export function useAccountActivation(): UseAccountActivation {
  const [user, setUser] = useState<AppUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const { decision, signedIn, loading, refresh: refreshDecision } = useDecisionFeed();
  const { rewardState, loading: rewardLoading, refresh: refreshReward } = useRewardState(signedIn);

  useEffect(() => {
    const unsubscribe = initAuth(
      (u) => {
        setUser(u);
        setAuthReady(true);
      },
      () => {
        setUser(null);
        setAuthReady(true);
      },
    );
    return () => unsubscribe();
  }, []);

  const emailVerified = !!(user?.emailVerified || user?.email_verified);
  const walletBound = !!rewardState?.walletAddress;

  const activeMission = useMemo(
    () => decision?.items.find((i) => i.kind === "CONTINUE_MISSION") ?? null,
    [decision],
  );

  const missingRequirementLabel = useMemo(() => {
    if (!rewardState || rewardState.requirementsMet) return null;
    const unmet = rewardState.requirements.filter((r) => !r.met);
    // Email + wallet are already shown as their own activation steps.
    const other = unmet.find((r) => !/email|wallet/i.test(r.label));
    return (other ?? unmet[0])?.label ?? null;
  }, [rewardState]);

  const view = useMemo(
    () =>
      resolveActivation({
        signedIn: signedIn && !!user,
        emailVerified,
        walletBound,
        rewardRequirementsMet: rewardState ? rewardState.requirementsMet : true,
        missingRequirementLabel,
        activeMissionTitle: activeMission?.title ?? null,
        activeMissionHref: activeMission?.surface.href ?? null,
      }),
    [signedIn, user, emailVerified, walletBound, rewardState, missingRequirementLabel, activeMission],
  );

  const sendVerificationEmail = useCallback(async () => {
    trackActivation("VERIFY_STARTED");
    try {
      await sendVerification();
      trackActivation("VERIFY_EMAIL_SENT");
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Could not send the verification email." };
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const fresh = await reloadUser();
      if (fresh) {
        setUser(fresh);
        if (fresh.emailVerified) trackActivation("EMAIL_VERIFIED_OBSERVED");
      }
    } catch {
      /* read-only refresh */
    }
    await Promise.all([refreshReward(), Promise.resolve(refreshDecision())]);
  }, [refreshReward, refreshDecision]);

  return {
    view,
    loading: !authReady || loading || (signedIn && rewardLoading && !rewardState),
    signedIn: signedIn && !!user,
    emailVerified,
    walletBound,
    email: user?.email ?? null,
    sendVerificationEmail,
    refresh,
  };
}
