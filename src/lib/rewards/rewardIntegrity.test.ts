import { describe, expect, it } from 'vitest';
import { mainnetSwapEvidence, reconcileAccount, type ReconLedgerRow } from './historicalReconciliation';
import { buildFundingQueue } from './fundingQueue';
const row = (extra: Partial<ReconLedgerRow> = {}): ReconLedgerRow => ({ id:'row',reason:'CORE_SWAP_V2',points:1022,chainId:677,createdAt:'2026-10-20',evidenceKey:'677:tx:8',verifiedUsd:1022,dayKey:'2026-10-20',refereeId:null,reservationId:'reservation',fundingState:'FUNDED',provenanceState:'VERIFIED',...extra });
describe('reward integrity quarantine', () => {
  it('does not treat an adjustment evidence label as payout authorization', () => {
    const result=reconcileAccount({userId:'account',createdAt:'2026-10-05',storedFlowPoints:1000,storedPointsSelf:1000,storedReferralSignup:0,ledger:[row({reason:'ADMIN_ADJUSTMENT',points:1000})]},new Map());
    expect(result.authoritative).toBe(0);expect(result.eligibleRowIds).toEqual([]);
  });
  it('blocks all 1,022 Round 3 swap points with unresolved provenance', () => {
    const result = reconcileAccount({userId:'account',createdAt:'2026-10-05',storedFlowPoints:1122,storedPointsSelf:1022,storedReferralSignup:0,ledger:[row({provenanceState:'PENDING'})]},new Map());
    expect(result.authoritative).toBe(0); expect(result.eligibleRowIds).toEqual([]); expect(result.excluded[0]?.points).toBe(1022);
  });
  it('preserves legitimate independently supported 1,022 points', () => expect(mainnetSwapEvidence([row()]).reduce((s,r)=>s+r.points,0)).toBe(1022));
  it('rejects a forged or absent activity identity', () => expect(mainnetSwapEvidence([row({evidenceKey:null})])).toEqual([]));
  it('rejects inflated rewards despite a valid-looking identity', () => expect(mainnetSwapEvidence([row({verifiedUsd:5})])).toEqual([]));
  it('enforces the $5 minimum', () => expect(mainnetSwapEvidence([row({points:4,verifiedUsd:4.99})])).toEqual([]));
  it('keeps the extra 74 unfunded unverified points out of the funding queue', () => {
    const queue=buildFundingQueue([{id:'extra',user_id:'account',points:74,reason:'CORE_SWAP_V2',chain_id:677,funding_state:'UNFUNDED',reservation_id:null,program_id:'CORE_SWAP',policy_version:'FLOW_POINTS_V2',wallet_address:'wallet',tx_hash:'tx',verified_activity_id:'activity',created_at:'2026-10-20',provenance_state:'PENDING'}],new Map([['account','wallet']]));
    expect(queue.eligible).toEqual({}); expect(queue.excluded[0]?.points).toBe(74); expect(queue.excluded[0]?.reason).toBe('PROVENANCE_REVIEW_REQUIRED');
  });
});