/**
 * B1 Gate 3 — verified-activity -> campaign-settlement server handoff.
 *
 * Only a CONFIRMED, server-produced verification outcome may trigger durable
 * campaign settlement, and only the server-verified activity.user is passed as
 * settlement authority. The browser supplies nothing here.
 */
import type { VerificationOutcome } from '../activity/activityVerifier';
import {
  settleDurableCampaignsForWallet,
  type DurableSettlementDeps,
  type DurableSettlementSummary,
} from './campaignSettlement.server';

export type { DurableSettlementSummary };

export async function settleCampaignsForVerificationOutcome(
  outcome: VerificationOutcome,
  deps: DurableSettlementDeps = {},
): Promise<DurableSettlementSummary | null> {
  if (outcome.status !== 'CONFIRMED') return null;
  const wallet = outcome.activity.user;
  if (!wallet) return null;
  return await settleDurableCampaignsForWallet(wallet.toLowerCase(), deps);
}
