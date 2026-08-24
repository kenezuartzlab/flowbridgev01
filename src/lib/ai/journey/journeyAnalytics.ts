/**
 * FlowBridge V26 §10 — presentation-only journey analytics.
 *
 * HARD RULE: these events are NEVER completion evidence, never reward
 * settlement, and never touch canonical economic activity. They carry no amounts,
 * no wallet addresses, no tx hashes and no evidence ids — only which surface was
 * shown or tapped. The sink is intentionally local/no-op by default.
 */
import type { JourneyId, JourneyStageStatus } from "./journeyTypes";

export type JourneyAnalyticsEvent =
  | "JOURNEY_SHOWN"
  | "JOURNEY_STAGE_SHOWN"
  | "JOURNEY_CTA_CLICKED"
  | "JOURNEY_SKIPPED"
  | "JOURNEY_DISMISSED"
  | "JOURNEY_SNOOZED"
  | "JOURNEY_NAVIGATION_COMPLETED";

export interface JourneyAnalyticsPayload {
  event: JourneyAnalyticsEvent;
  journeyId: JourneyId;
  stageId?: string;
  stageStatus?: JourneyStageStatus;
  destination?: string;
  /** Constant: presentation telemetry can never prove an economic outcome. */
  isEconomicEvidence: false;
}

type Sink = (payload: JourneyAnalyticsPayload) => void;

let sink: Sink | null = null;

/** Test/host hook. Presentation only — a sink may never write economic state. */
export function setJourneyAnalyticsSink(next: Sink | null) {
  sink = next;
}

export function trackJourney(
  event: JourneyAnalyticsEvent,
  journeyId: JourneyId,
  extra?: { stageId?: string; stageStatus?: JourneyStageStatus; destination?: string },
) {
  const payload: JourneyAnalyticsPayload = {
    event,
    journeyId,
    isEconomicEvidence: false,
    ...(extra ?? {}),
  };
  try {
    sink?.(payload);
  } catch {
    /* analytics must never break a product surface */
  }
}
