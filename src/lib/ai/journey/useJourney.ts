/**
 * FlowBridge V26 §6/§8 — one shared read of the current guided journey.
 *
 * Reuses the existing V25 decision feed and the canonical V17.1B reward state
 * (no new reads, no new endpoints) and recomputes the journey whenever either
 * changes. Read-only: this hook cannot create a mission or an ActionIntent.
 */
import { useCallback, useMemo, useState } from "react";
import { useDecisionFeed } from "../experience/useDecisionFeed";
import { useRewardState } from "@/lib/rewards/useRewardState";
import { buildJourneyContext, selectJourneys } from "./journeyResolver";
import {
  dismissJourney,
  readJourneyPresentation,
  skipJourney,
  snoozeJourney,
} from "./journeyPresentationState";
import type { JourneyId } from "./journeyTypes";

export function useJourney() {
  const { decision, signedIn, loading } = useDecisionFeed();
  const { rewardState, loading: rewardLoading } = useRewardState(signedIn);
  const [presentation, setPresentation] = useState(() => readJourneyPresentation());

  const ctx = useMemo(
    () => buildJourneyContext({ decision, rewardState, signedIn }),
    [decision, rewardState, signedIn],
  );

  const selection = useMemo(
    () => selectJourneys({ ctx, presentation }),
    [ctx, presentation],
  );

  const dismiss = useCallback((id: JourneyId) => setPresentation(dismissJourney(id)), []);
  const skip = useCallback((id: JourneyId) => setPresentation(skipJourney(id)), []);
  const snooze = useCallback((id: JourneyId) => setPresentation(snoozeJourney(id)), []);

  return {
    ctx,
    signedIn,
    decision,
    journey: selection.primary,
    secondary: selection.secondary,
    selection,
    loading: loading || (signedIn && rewardLoading && !rewardState),
    dismiss,
    skip,
    snooze,
  };
}
