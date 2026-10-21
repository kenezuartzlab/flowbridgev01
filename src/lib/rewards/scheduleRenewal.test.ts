import { describe, expect, it } from 'vitest';
import { payoutNextAction, proposeScheduleRenewal, validClaimSchedule } from './scheduleRenewal';
import { prepareSettlementBatch } from './settlementPlanner';
import { MAINNET_PAYOUT_AUDIT } from './rewardFundingPlan';
import type { Hex } from 'viem';
const now = 1792552705;
const run = (points = 1122) => prepareSettlementBatch({ rows: [{ userId:'fixture', wallet:'0x'+'1'.repeat(40), classification:'MATCH', authoritative:points, pendingReview:0, alreadyAllocatedPoints:0 }], fundedPointsAvailable:1122, chainId:677, distributor:MAINNET_PAYOUT_AUDIT.address as Hex, chain:{epochCount:2,campaignBudgetWei:2000000n*10n**18n,totalClaimedWei:11n*10n**18n,totalReservedWei:0n,balanceWei:2500000n*10n**18n,minPublishDelay:86400,paused:false,nowSec:now} });
function fixture() { const c=run(); if(!c.batch?.root) throw new Error('fixture'); return {id:'original',fingerprint:c.fingerprint,epochId:3,root:c.batch.root,totalWei:c.batch.totalWei,leaves:c.batch.leaves,claimStart:1792512000,claimEnd:1795104000,published:false}; }
describe('authorized schedule-only renewal',()=>{
 it('preserves the contract 24-hour delay, margin and 30-day window',()=>{const s=validClaimSchedule(now,86400);expect(s.claimStart-now).toBeGreaterThanOrEqual(86400+7200);expect(s.claimEnd-s.claimStart).toBe(30*86400);expect(s.signBefore).toBe(s.claimStart-86400);});
 it('never shortens a larger actual contract delay',()=>expect(validClaimSchedule(now,172800).claimStart-now).toBeGreaterThanOrEqual(172800+7200));
 it('failed or invalid timing reads fail closed',()=>{for(const d of [0,86399,NaN])expect(()=>validClaimSchedule(now,d)).toThrow();});
 it('prepares exactly 1122 FLOW for one wallet without changing the expired original',()=>{const old=fixture(), before=JSON.stringify(old);const p=proposeScheduleRenewal(run(),old,now,86400);expect(p.ready).toBe(true);expect(p.totalWei).toBe('1122000000000000000000');expect(p.wallets).toBe(1);expect(p.root).toBe(old.root);expect(p.fingerprint).not.toBe(old.fingerprint);expect(JSON.stringify(old)).toBe(before);});
 it('74 unfunded points cannot increase an approved renewal',()=>{const p=proposeScheduleRenewal(run(1196),fixture(),now,86400);expect(p.ready).toBe(false);expect(p.blockers).toContain('IMMUTABLE_ALLOCATION');});
 it('776 restricted points cannot increase a renewal',()=>expect(proposeScheduleRenewal(run(1898),fixture(),now,86400).ready).toBe(false));
 it('confirmed originals never renew',()=>expect(proposeScheduleRenewal(run(),{...fixture(),published:true},now,86400).ready).toBe(false));
 it('eight concurrent proposals have one identical fingerprint and calldata',()=>{const ps=Array.from({length:8},()=>proposeScheduleRenewal(run(),fixture(),now,86400));expect(new Set(ps.map(p=>p.fingerprint)).size).toBe(1);expect(new Set(ps.map(p=>p.calldata)).size).toBe(1);});
 it('pending broadcast always takes precedence over sign or renewal',()=>{expect(payoutNextAction({pending:true,hash:'0xabc',renewalNeeded:true,renewalReady:true,ready:true,reviewed:true,authorized:true})).toBe('RE_CHECK');expect(payoutNextAction({pending:true,renewalNeeded:false,renewalReady:false,ready:true,reviewed:true,authorized:true})).toBe('RECOVER');});
 it('unauthorized and stale readiness never offer signing',()=>expect(payoutNextAction({pending:false,renewalNeeded:false,renewalReady:false,ready:true,reviewed:true,authorized:false})).toBe('RE_CHECK'));
});