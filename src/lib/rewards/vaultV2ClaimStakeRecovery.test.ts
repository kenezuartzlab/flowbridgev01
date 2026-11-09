import { describe, it, expect } from 'vitest';
import { classifySaved, quoteFingerprint, runClaimStake, termsChangeReason, type ClaimStakeOperation, type ClaimStakePort, type FlexibleQuote, type Step } from './vaultV2ClaimStake';
import { withFlowLock } from './flowLock';
import { unifiedRewardTotals } from './unifiedRewards';
import type { RewardsSummary } from './rewardsSummary';
const w='0x0000000000000000000000000000000000000001', t='0x0000000000000000000000000000000000000002', v='0x0000000000000000000000000000000000000003';
const q0:FlexibleQuote={token:t,stakingVault:v,controller:v,treasury:v,principal:50n,minimum:1n,active:true,paused:false,emergency:false,lockSeconds:0,positions:0n,positionLimit:32n,allowance:50n,balance:50n,genesisRate:1800,genesisSeconds:7776000,genesisObligation:200n,floorRate:0,floorObligation:0n,genesisAvailable:true,variableRate:5n};
const op=(mode:'claim'|'stake',tx:Partial<ClaimStakeOperation['transactions']>={}):ClaimStakeOperation=>({version:1,wallet:w,rewardVault:v,token:t,stakingVault:v,mode,claimAmount:'50',principal:'50',terms:quoteFingerprint(q0),transactions:tx,complete:false});
const it0=(step:Step,hash:`0x${string}`|null=`0x${'a'.repeat(64)}`)=>({step,nonce:1,startBlock:'1',hash});
function port(q:FlexibleQuote,sent:Step[],opts:{notSent?:Step}={}):ClaimStakePort{let claimable=50n;return{identity:async()=>{},claimable:async()=>claimable,quote:async()=>q,prepare:async s=>({step:s,nonce:sent.length,startBlock:'1',hash:null}),send:async i=>{if(opts.notSent===i.step)throw Object.assign(new Error('pre-wallet check failed'),{notSent:true});sent.push(i.step);return `0x${'b'.repeat(64)}`;},verify:async i=>{if(i.step==='claim')claimable=0n;return 'success';},save:()=>{},status:()=>{}};}

describe('stable staking terms',()=>{
  it('seconds ticking, falling Genesis obligation and variable emission do not change terms',()=>{
    expect(quoteFingerprint({...q0,genesisSeconds:7775000,genesisObligation:150n,variableRate:0n,positions:1n,allowance:0n,balance:999n})).toBe(quoteFingerprint(q0));
  });
  for(const [name,patch,reason] of [['Genesis no longer available',{genesisAvailable:false},'no longer available'],['lower Genesis rate',{genesisRate:1500},'Genesis rate changed'],['floor APR',{floorRate:100},'Floor APR'],['minimum',{minimum:10n},'Minimum'],['paused',{paused:true},'changed'],['different vault',{stakingVault:w},'changed']] as const)
    it(`material change: ${name}`,()=>{const q={...q0,...patch};expect(quoteFingerprint(q)).not.toBe(quoteFingerprint(q0));expect(termsChangeReason(quoteFingerprint(q0),q)).toContain(reason);});
  it('ticking quote between review and claim still claims and stakes',async()=>{const sent:Step[]=[];await runClaimStake(op('stake'),port({...q0,genesisSeconds:7770000,genesisObligation:190n,variableRate:0n},sent));expect(sent).toEqual(['claim','stake']);});
  it('old saved fingerprints require explicit review',()=>{expect(termsChangeReason('0xabc:old',q0)).toContain('older version');});
});
describe('saved flow recovery',()=>{
  it('no-transaction intent is discarded automatically',()=>expect(classifySaved(op('stake'),{})).toBe('DISCARD_NO_TX'));
  it('verified claim-only flow is archived so a new Claim & Stake can start',()=>expect(classifySaved(op('claim',{claim:it0('claim')}),{claim:'success'})).toBe('ARCHIVE_VERIFIED'));
  it('verified claim with no stake offers Resume staking only',()=>expect(classifySaved(op('stake',{claim:it0('claim')}),{claim:'success'})).toBe('RESUME_STAKING'));
  it('verified claim and stake is archived',()=>expect(classifySaved(op('stake',{claim:it0('claim'),stake:it0('stake')}),{claim:'success',stake:'success'})).toBe('ARCHIVE_VERIFIED'));
  it('unknown hash or unverified receipt stays pending, never resend',()=>{expect(classifySaved(op('claim',{claim:it0('claim',null)}),{})).toBe('CHECK_PENDING');expect(classifySaved(op('stake',{claim:it0('claim'),stake:it0('stake',null)}),{claim:'success'})).toBe('CHECK_PENDING');});
  it('pre-wallet failure releases the intent instead of stranding it',async()=>{const o=op('claim');await expect(runClaimStake(o,port(q0,[],{notSent:'claim'}))).rejects.toThrow('pre-wallet');expect(o.transactions.claim).toBeUndefined();expect(classifySaved(o,{})).toBe('DISCARD_NO_TX');});
  it('resume after verified claim never claims again',async()=>{const sent:Step[]=[];const o=op('stake',{claim:it0('claim')});await runClaimStake(o,port(q0,sent));expect(sent).toEqual(['stake']);});
});
describe('flow lock fallback without navigator.locks',()=>{
  const mem=()=>{const m=new Map<string,string>();return{getItem:(k:string)=>m.get(k)??null,setItem:(k:string,x:string)=>{m.set(k,x);},removeItem:(k:string)=>{m.delete(k);}};};
  it('second tab is refused while first runs, then allowed',async()=>{const store=mem();let inner:Promise<unknown>|null=null;await withFlowLock('k',async()=>{inner=withFlowLock('k',async()=>1,{store,id:'b'});await expect(inner).rejects.toThrow('another tab');},{store,id:'a'});await expect(withFlowLock('k',async()=>2,{store,id:'b'})).resolves.toBe(2);});
  it('stale lease expires',async()=>{const store=mem();store.setItem('k:lease',JSON.stringify({id:'x',at:0}));await expect(withFlowLock('k',async()=>3,{store,id:'a',now:()=>20*60_000})).resolves.toBe(3);});
});
describe('unified totals',()=>{
  const s={totalPts:2228,eligibleFundedUnallocated:0,pendingFunding:752,pendingReview:0,claimableNow:0,claimedLifetime:1122,stale:false} as RewardsSummary;
  const E=10n**18n;
  it('V2 claimable is not hidden by a legacy 0',()=>{const r=unifiedRewardTotals(s,{claimableWei:781n*E,claimedWei:0n},true);expect(r.claimableFlow).toBe(781);expect(r.primary).toBe('CLAIM');expect(r.v1ClaimableFlow).toBe(0);});
  it('claimed sums V1 history and V2 on-chain claims without double count',()=>expect(unifiedRewardTotals(s,{claimableWei:0n,claimedWei:200n*E},true).claimedFlow).toBe(1322));
  it('unread V2 keeps totals unknown, never a false 0',()=>{const r=unifiedRewardTotals(s,undefined,true);expect(r.claimableFlow).toBeNull();expect(r.claimedFlow).toBeNull();});
  it('available Points come from funded unallocated, never lifetime minus claimed',()=>{const r=unifiedRewardTotals(s,null,false);expect(r.availablePts).toBe(0);expect(r.earnedPts).toBe(2228);expect(r.pendingFundingPts).toBe(752);});
  it('reconciliation hold shows under verification, not available',()=>{const r=unifiedRewardTotals({...s,eligibleFundedUnallocated:299},null,false,true);expect(r.availablePts).toBeNull();expect(r.reconciliationHeldPts).toBe(299);});
  it('stale summary shows under verification',()=>expect(unifiedRewardTotals({...s,stale:true},null,false).availablePts).toBeNull());
});
