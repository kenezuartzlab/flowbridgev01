import { describe,it,expect } from 'vitest';
import { quoteStatus,rankResearchQuotes,userNet,COMPARISON_LIMITS,type ResearchQuote } from './comparisonRanking';
const E=10n**18n, now=1_000_000;
const q=(patch:Partial<ResearchQuote>={}):ResearchQuote=>({id:'p',provider:'pancake-500',chainId:56,direction:'WBNB->USDT',sellAmount:E.toString(),buyAmount:(600n*E).toString(),fee:'0',feeToken:null,semantics:'INCLUDED',gasWei:'10000000000000',gasClass:'SIMULATION',observedAt:now,blockTime:now-1000,block:1000,latencyMs:100,provenance:true,archived:false,reused:false,impactBps:1,status:'OK',...patch});
describe('V1.9 synthetic ranking, never execution',()=>{
 it('TTL is at most 30 seconds',()=>{expect(COMPARISON_LIMITS.ttlMs).toBe(30_000);expect(quoteStatus(q(),now+30_001)).toBe('STALE');});
 it('gas subtracted exactly once with base-unit precision',()=>expect(userNet(q(),600n*E)).toBe(600n*E-6_000_000_000_000_000n));
 it('included buy-token 15 bps fee is not deducted again',()=>expect(userNet(q({fee:(9n*E/10n).toString(),feeToken:'buy'}),E)).toBe(600n*E-10_000_000_000_000n));
 it('excluded buy fee deducts exactly once',()=>expect(userNet(q({fee:(9n*E/10n).toString(),feeToken:'buy',semantics:'EXCLUDED'}),E)).toBe(600n*E-9n*E/10n-10_000_000_000_000n));
 it('15 bps sell fee included does not change buy again',()=>expect(userNet(q({fee:'1500000000000000',feeToken:'sell'}),E)).toBe(600n*E-10_000_000_000_000n));
 it('excluded sell fee converts average rate, not a new quote',()=>expect(userNet(q({fee:'1500000000000000',feeToken:'sell',semantics:'EXCLUDED'}),E)).toBe(600n*E-9n*E/10n-10_000_000_000_000n));
 it('unknown fee has no net',()=>expect(userNet(q({semantics:'UNKNOWN'}),E)).toBeNull());
 it('USDT->WBNB gas is in WBNB wei',()=>expect(userNet(q({direction:'USDT->WBNB',sellAmount:(600n*E).toString(),buyAmount:E.toString()}),E)).toBe(E-10_000_000_000_000n));
 it('floors fractional base units',()=>expect(userNet(q({buyAmount:'101',sellAmount:'3',fee:'1',feeToken:'sell',semantics:'EXCLUDED',gasWei:'1'}),E)).toBe(67n));
 it.each<[Partial<ResearchQuote>,string]>([
  [{archived:true},'STALE'],[{reused:true},'STALE'],[{blockTime:now+1},'STALE'],[{observedAt:now+1},'STALE'],[{blockTime:now-30_001},'STALE'],
  [{latencyMs:5001},'UNCOMPARABLE'],[{impactBps:101},'UNCOMPARABLE'],[{gasWei:null},'GAS_UNKNOWN'],[{gasWei:'0'},'GAS_UNKNOWN'],
  [{semantics:'UNKNOWN'},'FEE_UNKNOWN'],[{status:'RATE_LIMITED'},'RATE_LIMITED'],[{status:'UNAVAILABLE'},'PROVIDER_UNAVAILABLE'],
  [{chainId:677},'BLOCKED'],[{direction:'XAUt->USDT' as ResearchQuote['direction']},'BLOCKED'],[{provenance:false},'BLOCKED'],[{buyAmount:'1.1'},'BLOCKED'],[{feeToken:null,fee:'1'},'BLOCKED'],[{fee:(600n*E).toString(),feeToken:'buy'},'BLOCKED'],
 ])('rejects %j', (patch,status)=>expect(quoteStatus(q(patch),now)).toBe(status));
 const other=(patch:Partial<ResearchQuote>={})=>q({id:'z',provider:'0x',buyAmount:(599n*E).toString(),...patch});
 it('ranks better net only as non-executable research',()=>expect(rankResearchQuotes([q(),other()],now,600n*E,0)).toEqual({status:'COMPARABLE',candidate:'p',executable:false}));
 it('does not default to 0x on 429',()=>expect(rankResearchQuotes([q(),other({status:'RATE_LIMITED'})],now,E,0).candidate).toBeNull());
 it('unknown fees prevent winner',()=>expect(rankResearchQuotes([q(),other({semantics:'UNKNOWN'})],now,E,0).status).toBe('FEE_UNKNOWN'));
 it('tie never selects',()=>expect(rankResearchQuotes([q(),other({buyAmount:(600n*E).toString()})],now,E,0).status).toBe('TIE'));
 it('block difference >12 is uncomparable',()=>expect(rankResearchQuotes([q(),other({block:1013})],now,E,0).status).toBe('UNCOMPARABLE'));
 it('window difference >15 seconds is uncomparable',()=>expect(rankResearchQuotes([q(),other({observedAt:now-15001})],now,E,0).status).toBe('UNCOMPARABLE'));
 it('drift >5 bps is uncomparable',()=>expect(rankResearchQuotes([q(),other()],now,E,5.01).status).toBe('UNCOMPARABLE'));
 it('different amounts invalidate',()=>expect(rankResearchQuotes([q(),other({sellAmount:'1'})],now,E,0).status).toBe('BLOCKED'));
 it('response reuse cannot create independent evidence',()=>expect(rankResearchQuotes([q(),other({id:'p'})],now,E,0).status).toBe('BLOCKED'));
 it('zero/negative net cannot recommend',()=>expect(rankResearchQuotes([q(),other({buyAmount:'1'})],now,E,0).status).toBe('BLOCKED'));
});