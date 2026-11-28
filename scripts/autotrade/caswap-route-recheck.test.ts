import {describe,it,expect,beforeAll} from 'vitest';
import {readFileSync} from 'node:fs';
import {getAddress,parseUnits} from 'viem';
import {assertAuditTransport,constantProductOut} from './caswap-audit-policy';
const dir='docs/security/caswap-route-recheck';
const live=JSON.parse(readFileSync(`${dir}/live.json`,'utf8'));
let fork:any;
const supplement=JSON.parse(readFileSync(`${dir}/supplement.json`,'utf8'));
const tiers=JSON.parse(readFileSync(`${dir}/tiers.json`,'utf8'));
const A=live.addresses;
describe('exact owner route identities at frozen recheck',()=>{
 it('proposed 0x64F4 LP is USDT/WBOT at 3000, not CA/CaSwap',()=>{
  const p=live.pools[getAddress('0x64F418471a1A7932a190E10da5A8551dB5AbeC05')];
  expect(p.token0).toBe(getAddress('0xababc7ddc03e501d190c676bf3d92ef0e6e87a3c'));
  expect(p.token1).toBe(getAddress('0xd5452816194a3784dba983426cce7c122f4abd30'));
  expect(p.factory).toBe(getAddress('0x1c51c173323ec11bb4e3c4fd2314c225dc4b5419'));
  expect(p.fee).toBe(3000);expect(p.decimals).toEqual([6,18]);
  expect(live.bdexDerivation.usdtWBOT3000).toBe(p.address);
 });
 it('alternative pool is exactly CA/caWBOT in the supplied router factory',()=>{
  const p=live.pools[getAddress('0xf728515430E588EEc584b76E8f2C814871c609B3')];
  expect([p.token0,p.token1]).toEqual([getAddress('0x546307af427902a75771434df831d88219784e19'),getAddress('0x68caea9104419203cf8b8f0b222e75709b97bfc6')]);
  expect(p.factory).toBe(live.contracts.supplied.venue.factory);expect(p.decimals).toEqual([18,18]);
 });
 it('actual BDEX CA pool is CA/canonical-WBOT at 1%',()=>{
  const p=live.pools[getAddress('0x822dc160CC971510Cf87999004a28b4A7aEFD082')];
  expect([p.token0,p.token1]).toEqual([A.ca,A.wbot]);expect(p.fee).toBe(10000);
  expect(live.bdexDerivation.caWBOT10000).toBe(p.address);
 });
 it('the alternative BDEX 0.3% CA pool is not mistaken for two-sided depth',()=>{
  const p=tiers.pools.find((p:any)=>p.fee===3000);
  expect(p.pool).toBe(getAddress('0x04a3511051a45543cfb5175f2fa6774a54bf0029'));
  expect(p.liquidity).toBe('0');expect(p.WBOT).toBe('1');
  const sells=tiers.quotes.filter((q:any)=>q.fee===3000&&q.side==='sell');
  expect(sells.length).toBe(3);for(const row of sells)expect(row.UNKNOWN).toContain('SPL');
 });
 it('old immutable factory contains one CA dust pool and cannot select the historical factory',()=>{
  const f=live.factories[live.contracts.old.venue.factory];
  expect(f.allPairsLength).toBe('1');expect(f.enumeration).toBe('COMPLETE_AT_PIN');
  expect(f.caPairs.map((p:any)=>p.pair)).toEqual([getAddress('0x0a0cfc8c3756d000be19f0809a23f57522a594f6')]);
  expect(supplement.historicalFactory.same).toBe(false);
  expect(supplement.historicalFactory.oldSuppliedLPpair).toBe('0x0000000000000000000000000000000000000000');
  expect(supplement.historicalFactory.historicCApair).toBe(getAddress('0xaf05f84820288e2bd39e427aef09b274056733d8'));
 });
 it('new directional sell fee is 73%, old sell fee is 30%, neither V4 caller exempt',()=>{
  expect(live.contracts.supplied.venue.directions.map((d:any)=>d.feeBps)).toEqual(['0','7300']);
  expect(live.contracts.old.venue.directions.map((d:any)=>d.feeBps)).toEqual(['0','3000']);
  expect(live.contracts.supplied.venue.exemption.routerV4).toBe(false);
  expect(live.contracts.old.venue.exemption.routerV4).toBe(false);
  expect(live.contracts.supplied.venue.maxBps).toBe('10000');
 });
 it('caller-aware CaSwap quotes include directional fee before constant-product output',()=>{
  for(const name of ['old','supplied'])for(const row of live.quotes.filter((q:any)=>q.venue===name)){
   const venue=live.contracts[name].venue,pool=live.factories[venue.factory].caPairs[0];
   const p=live.pools[pool.pair],sell=row.from.toLowerCase()===A.ca.toLowerCase();
   const expected=constantProductOut(BigInt(row.amount),BigInt(p.reserves[sell?0:1]),BigInt(p.reserves[sell?1:0]),BigInt(venue.directions[sell?1:0].feeBps));
   expect(row.userQuote[1]).toBe(expected.toString());
  }
 });
 it('active V3 ID1 is a UniversalRouter, not a usable standard V2 adapter',()=>{
  const universal=supplement.verifiedSources.find((s:any)=>s.name==='UniversalRouter');
  expect(universal.address).toBe(getAddress('0xae6ae8630f7a888dec0b9195c85f7515d5887655'));
  expect(universal.sourceRuntimeMatches).toBe(true);expect(universal.registrationRuntimeMatches).toBe(true);
  expect(universal.methods).not.toContain('swapExactETHForTokens');
  expect(universal.v2Compatibility).toBe('NO_STANDARD_V2_SELECTORS');
 });
 it('all five V3 entries and four active flags are recorded; V4 stays sole BDEX entry',()=>{
  expect(live.registries.v3.rows.map((r:any)=>r.id)).toEqual(['0','1','2','3','4']);
  expect(live.registries.v3.rows.filter((r:any)=>r.entry[3]).map((r:any)=>r.id)).toEqual(['1','2','3','4']);
  expect(live.registries.v4.count).toBe('1');expect(live.registries.v4.rows[0].entry[0]).toBe(A.bdex);
 });
 it('historical factory has its own WDO router, not an alternate factory for the old router',()=>{
  expect(tiers.historicalWrapper).toBe(A.caWbot);expect(tiers.historicalV4FeeExempt).toBe(false);
  expect(supplement.historicalFactory.historicDirectionalSellFee).toBe('500');
  expect(live.historical.find((r:any)=>r.id==='3').historicalFactory).toBe(live.contracts.old.venue.factory);
 });
});
describe('actual V4 caller, equal budget execution and no activation',()=>{
 beforeAll(()=>{fork=JSON.parse(readFileSync(`${dir}/fork.json`,'utf8'));});
 it('fork pin agrees with both read endpoints and has no mainnet effects',()=>{
  expect(live.pin.number).toBe('31793279');expect(live.pin.hash).toBe(live.pin.secondaryHash);
  expect(fork.fork.hash).toBe(live.pin.hash);expect(fork.sourcePin.number).toBe(live.pin.number);
  expect(fork.mainnetWrites).toBe(0);expect(fork.signatures).toBe(0);expect(fork.tokenOrPoolOverrides).toBe(false);
  expect(fork.result).toBe('COMPLETE');expect(fork.errors).toEqual([]);
 });
 it('executed native outputs match caller quotes, budgets, fee once and zero allowances',()=>{
  const rows=fork.observations.filter((r:any)=>r.actualOut!==undefined);
  expect(rows.length).toBe(24);
  for(const row of rows){expect(BigInt(row.spent)).toBeLessThanOrEqual(BigInt(row.totalBudget));expect(row.actualOut).toBe(row.quoted);expect(row.feeDelta).toBe(row.fee);expect(row.allowance).toBe('0');expect(row.routerAllowance).toBe('0');expect(row.residualChanges).toEqual([]);}
 });
 it('BDEX delivers more net output than both CaSwap choices at every sampled equal budget',()=>{
  for(const side of ['buy','sell'])for(const budget of side==='buy'?['0.1','1','5']:['1','10','100']){
   const rows=fork.observations.filter((r:any)=>r.side===side&&r.totalBudget===parseUnits(budget,18).toString());
   const bdex=rows.find((r:any)=>r.venue==='bdex');expect(bdex).toBeDefined();
   for(const venue of ['old','supplied','v3id4multi']){const other=rows.find((r:any)=>r.venue===venue);expect(other).toBeDefined();expect(BigInt(bdex.actualOut)).toBeGreaterThan(BigInt(other.actualOut));}
  }
 });
 it('CA/USDT and reverse both execute through the two exact BDEX pools',()=>{
  expect(fork.multiHop.length).toBe(6);
  for(const r of fork.multiHop){expect(r.actualOut).toBe(r.quoted);expect(r.allowance).toBe('0');expect(r.residualChanges).toEqual([]);const emitters=r.poolEmitters.map((a:string)=>a.toLowerCase());expect(emitters).toContain(A.caBdexPool.toLowerCase());expect(emitters).toContain(A.proposedLP.toLowerCase());}
 });
 it('read collector transport rejects registry writes, broadcasts and signing remotely',()=>{
  for(const method of ['eth_sendTransaction','eth_sendRawTransaction','personal_sign','anvil_setStorageAt'])expect(()=>assertAuditTransport('https://rpc.botchain.ai',method)).toThrow();
  expect(()=>assertAuditTransport('http://127.0.0.1:8547','eth_sendTransaction')).not.toThrow();
  expect(()=>assertAuditTransport('http://localhost:8547','eth_sendTransaction')).toThrow();
 });
});