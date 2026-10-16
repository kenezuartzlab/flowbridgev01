/** Fail-closed validation of the existing approved version; never changes economics. */
import { DEFAULT_FLOW_POINTS_V2_POLICY, type FlowPointsV2Policy } from './flowPointsV2';

export function validateApprovedRewardPolicy(p: FlowPointsV2Policy): FlowPointsV2Policy {
  const approved = DEFAULT_FLOW_POINTS_V2_POLICY;
  for (const key of Object.keys(approved) as (keyof FlowPointsV2Policy)[]) {
    if (p[key] !== approved[key]) throw new Error(`UNAPPROVED_REWARD_POLICY:${key}`);
  }
  return Object.freeze({ ...p });
}

export function validRewardReservation(f: {
  ledgerId: string; userId: string; wallet: string | null; points: number; program: string | null;
  reservation: null | { ledgerId: string; userId: string; wallet: string | null; points: number; program: string };
}): boolean {
  const r = f.reservation;
  return !!r && Number.isSafeInteger(f.points) && f.points > 0 && r.ledgerId === f.ledgerId &&
    r.userId === f.userId && !!f.wallet && r.wallet?.toLowerCase() === f.wallet.toLowerCase() &&
    r.points === f.points && r.program === f.program;
}