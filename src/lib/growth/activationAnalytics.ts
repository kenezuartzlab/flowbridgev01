/**
 * FlowBridge V28 §12 — activation analytics (presentation only).
 *
 * These events measure USEFUL activation, never pressure, and they are strictly
 * separate from reward settlement and transaction completion: nothing here can
 * mark a reward, a mission step or a transaction as done.
 */

export const ACTIVATION_EVENTS = [
  "ACTIVATION_CARD_SHOWN",
  "ACTIVATION_PROMPT_SHOWN",
  "VERIFY_STARTED",
  "VERIFY_EMAIL_SENT",
  "EMAIL_VERIFIED_OBSERVED",
  "WALLET_BINDING_STARTED",
  "WALLET_BOUND_OBSERVED",
  "ACTIVATION_COMPLETED_OBSERVED",
  "ACTIVATION_PROMPT_DECLINED",
  "ACTIVATION_PROMPT_SNOOZED",
  "DISCOVERY_ITEM_SHOWN",
  "DISCOVERY_ITEM_OPENED",
] as const;
export type ActivationEvent = (typeof ACTIVATION_EVENTS)[number];

export interface ActivationEventRecord {
  event: ActivationEvent;
  at: string;
  detail?: Record<string, string | number | boolean | null>;
  /** Constants: analytics can never settle anything. */
  settlesReward: false;
  completesTransaction: false;
}

const buffer: ActivationEventRecord[] = [];
const MAX = 100;

export function trackActivation(
  event: ActivationEvent,
  detail?: Record<string, string | number | boolean | null>,
): ActivationEventRecord {
  const record: ActivationEventRecord = {
    event,
    at: new Date().toISOString(),
    ...(detail ? { detail } : {}),
    settlesReward: false,
    completesTransaction: false,
  };
  buffer.push(record);
  if (buffer.length > MAX) buffer.splice(0, buffer.length - MAX);
  return record;
}

export function readActivationEvents(): readonly ActivationEventRecord[] {
  return [...buffer];
}

export function clearActivationEvents() {
  buffer.length = 0;
}
