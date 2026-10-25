import { describe, it, expect } from 'vitest';
import { assessRewardEvidence, type EvidenceRow, type ActivityEvidence } from './rewardEvidenceAssessment';
const activity: ActivityEvidence = { activity_id:'a', source_chain_id:677, source_tx_hash:'tx', source_log_index:8, user_wallet:'wallet', status:'CONFIRMED',kind:'SWAP_EXECUTED',evidence_source:'ROUTER_V3_RECEIPT',amount_raw:'10000000000000000000',occurred_at:'2026-10-20T00:00:00Z' };
const row: EvidenceRow = { id:'r',user_id:'u',points:10,base_points:10,verified_usd:10,policy_version:'FLOW_POINTS_V2',chain_id:677,tx_hash:'tx',source_log_index:8,verified_activity_id:'a',wallet_address:'wallet',funding_state:'UNFUNDED',reservation_id:null,provenance_state:'PENDING',day_key:'2026-10-20',metadata:{} };
const context = { activity,boundWallet:'wallet',duplicate:false,restricted:false,dailyPoints:10 };
describe('system evidence assessment', () => {
  it('recorded valuation alone requires an exception',()=>expect(assessRewardEvidence(row,context).status).toBe('NEEDS_EXCEPTION_REVIEW'));
  it('ordinary system verified rewards need no exception',()=>expect(assessRewardEvidence({...row,provenance_state:'VERIFIED'},context).status).toBe('SYSTEM_VERIFIED'));
  it.each(['duplicate','restricted'] as const)('cannot override %s',key=>expect(assessRewardEvidence(row,{...context,[key]:true}).exceptionAllowed).toBe(false));
  it('wrong wallet is not a valuation exception',()=>expect(assessRewardEvidence(row,{...context,boundWallet:'other'}).exceptionAllowed).toBe(false));
  it('daily cap violations cannot be waived',()=>expect(assessRewardEvidence(row,{...context,dailyPoints:1001}).exceptionAllowed).toBe(false));
  it('funded records require original matching reservations',()=>expect(assessRewardEvidence({...row,funding_state:'FUNDED',reservation_id:'old'},context).status).toBe('BLOCKED'));
  it('recognizes replayable original server evidence without changing the row',()=>{
    const original = {...row,metadata:{validationStatus:'PASS',policyVersion:'FLOW_POINTS_V2',dailyCoreSwapCap:1000,alreadyAwardedToday:0,valuationEvidence:{authority:'SERVER_CANONICAL_INGEST_V1',source:'BOT_DEX_PRICE',priceUsd:1,decimals:18,amountRaw:activity.amount_raw,observedAt:'2026-10-20T00:01:00Z'}}};
    expect(assessRewardEvidence(original,context).status).toBe('ORIGINAL_EVIDENCE_ESTABLISHED'); expect(original.provenance_state).toBe('PENDING');
  });
  it('today pricing never establishes old valuation',()=>expect(assessRewardEvidence({...row,metadata:{valuationEvidence:{authority:'SERVER_CANONICAL_INGEST_V1',source:'DEX',priceUsd:1,decimals:18,amountRaw:activity.amount_raw,observedAt:'2026-10-25T00:01:00Z'}}},context).status).toBe('NEEDS_EXCEPTION_REVIEW'));
});