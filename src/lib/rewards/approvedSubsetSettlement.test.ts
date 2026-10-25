import { describe, expect, it } from 'vitest';
import { reconcileAccount, type ReconLedgerRow } from './historicalReconciliation';
import { prepareSettlementBatch } from './settlementPlanner';
import { proposeScheduleRenewal } from './scheduleRenewal';
import { settlementEligibility } from './publicClaimPolicy';

const wallet = '0x0000000000000000000000000000000000000123';
const ledgerRow = (id: string, points: number, provenanceState: string): ReconLedgerRow => ({
  id, points, provenanceState, reason: 'CORE_SWAP_V2', chainId: 677,
  createdAt: '2026-10-18T00:00:00Z', evidenceKey: id, verifiedUsd: points,
  dayKey: '2026-10-18', refereeId: null, reservationId: id, fundingState: 'FUNDED',
});
function reconcile(extra: ReconLedgerRow[], stored = 1476) {
  return reconcileAccount({ userId: 'recipient', createdAt: '2026-10-10T00:00:00Z',
    storedFlowPoints: stored, storedPointsSelf: 1376, storedReferralSignup: 0,
    ledger: [ledgerRow('approved', 1022, 'EXCEPTION_APPROVED'), {
      ...ledgerRow('signup', 100, 'PENDING'), reason: 'SIGNUP_BONUS_REFEREE', chainId: null,
    }, ...extra],
  }, new Map());
}

describe('approved subset payout after grouped review', () => {
  it('keeps 354 held/unfunded Points excluded without vetoing the approved 1,122 payout', () => {
    const held = { ...ledgerRow('held', 354, 'PENDING'), fundingState: 'UNFUNDED', reservationId: null };
    const r = reconcile([held]);
    expect(r.classification).toBe('EXPLAINED_DIFFERENCE');
    expect(r.authoritative).toBe(1122);
    expect(r.eligibleRowIds).toEqual(['approved', 'signup']);
    expect(r.excluded).toEqual([{ rowId: 'held', reason: 'CORE_SWAP_V2', points: 354, cause: 'PROVENANCE_REVIEW_REQUIRED' }]);
    expect(r.nonclaimableHistorical).toBe(0);
    const rows = [{ ...r, wallet, alreadyAllocatedPoints: 0 }];
    expect(settlementEligibility([{ wallet, classification: r.classification, pendingReview: r.pendingReview,
      authoritative: r.authoritative, fundedPoints: 1122, alreadySettledPoints: 0 }])).toMatchObject({ wallets: 1, totalFlow: 1122 });
    const candidate = prepareSettlementBatch({ rows, fundedPointsAvailable: 1122,
      chainId: 677, distributor: '0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922',
      chain: { epochCount: 2, campaignBudgetWei: 1000000n * 10n ** 18n, totalClaimedWei: 11n * 10n ** 18n,
        totalReservedWei: 0n, balanceWei: 2000000n * 10n ** 18n, minPublishDelay: 86400, paused: false, nowSec: 1792922400 },
    });
    expect(candidate.batch?.totalWei).toBe('1122000000000000000000');
    if (!candidate.batch?.root) throw new Error('Expected approved payout');
    const stored = { ...candidate.batch, root: candidate.batch.root, epochId: 3, id: 'stored',
      fingerprint: candidate.fingerprint, published: false, claimStart: 1792512000, claimEnd: 1795104000 };
    const before = JSON.stringify(stored);
    expect(proposeScheduleRenewal(candidate, stored, 1792922400, 86400)).toMatchObject({ needed: true, ready: true, blockers: [], totalWei: '1122000000000000000000' });
    expect(JSON.stringify(stored)).toBe(before);
  });
  it('does not explain an additional unsupported 50-Point aggregate mismatch', () => {
    const r = reconcile([ledgerRow('held', 354, 'PENDING')], 1526);
    expect(r.classification).toBe('UNEXPLAINED_POSITIVE_DIFFERENCE');
    expect(r.authoritative).toBe(1122);
  });
  it('does not use duplicate accepted rewards to explain or increase eligibility', () => {
    const r = reconcile([{ ...ledgerRow('duplicate', 354, 'EXCEPTION_APPROVED'), evidenceKey: 'approved' }]);
    expect(r.classification).toBe('UNEXPLAINED_POSITIVE_DIFFERENCE');
    expect(r.eligibleRowIds).not.toContain('duplicate');
    expect(r.authoritative).toBe(1122);
  });
  it('does not make pending historical rewards eligible before approval', () => {
    const r = reconcileAccount({ userId: 'pending', createdAt: '2026-10-10T00:00:00Z',
      storedFlowPoints: 1022, storedPointsSelf: 1022, storedReferralSignup: 0,
      ledger: [ledgerRow('pending', 1022, 'PENDING')], }, new Map());
    expect(r.authoritative).toBe(0);
    expect(r.eligibleRowIds).toEqual([]);
    expect(settlementEligibility([{ wallet, classification: r.classification, pendingReview: r.pendingReview,
      fundedPoints: 0, authoritative: r.authoritative, alreadySettledPoints: 0 }]).wallets).toBe(0);
  });
});