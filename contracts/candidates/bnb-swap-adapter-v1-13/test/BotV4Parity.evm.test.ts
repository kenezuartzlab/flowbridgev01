/**
 * BOT Router V4 (native-V3-multi, deployed BOT Mainnet 0x7965…fc61) security invariants PORTED to the frozen BNB V1.13 candidate.
 * Source of each invariant: contracts/production/router-v4-native-v3-multi/test/V31_NativeV3Multi.t.sol (named in each `it`).
 * Local mock EVM only (@ethereumjs/vm, Cancun, chain 56). Not a BSC client, not a fork, not an audit. V1.13 source is not modified.
 */
import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { createVM } from '@ethereumjs/vm';
import { createCustomCommon, Mainnet, Hardfork } from '@ethereumjs/common';
import { Account, createAddressFromString, bytesToHex, hexToBytes } from '@ethereumjs/util';
import { decodeEventLog, decodeFunctionResult, encodeDeployData, encodeFunctionData, keccak256, toFunctionSelector } from 'viem';
// @ts-expect-error pinned local compiler
import { compile } from '../scripts/compile.mjs';
const T='contracts/candidates/bnb-swap-adapter-v1-13/test/';
const out=compile({'Mocks.sol':{content:fs.readFileSync(T+'Mocks.sol','utf8')},'ParityMocks.sol':{content:fs.readFileSync(T+'ParityMocks.sol','utf8')}});
const A=out['FlowBridgeBnbSwapAdapterV1_13.sol'].FlowBridgeBnbSwapAdapterV1_13;
const W=out['Mocks.sol'].MockWBNB,U=out['Mocks.sol'].MockUSDT,R=out['Mocks.sol'].MockRouter,H=out['Mocks.sol'].TestRecipient,IG=out['ParityMocks.sol'].IgnoreMinRouter;
const w='0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',u='0x55d398326f99059fF775485246999027B3197955',r='0x1b81D678ffb9C0263b24A97847620C99d213eB14';
const user='0x00000000000000000000000000000000000000a1',other='0x00000000000000000000000000000000000000b2',guardian='0x00000000000000000000000000000000000000c3',fee='0x000000000000000000000000000000000f1b00fe';
const E=10n**18n,NOW=1800000000n,HASH=`0x${'11'.repeat(32)}`;
let vm:any,adapter='';
const common=(id=56)=>createCustomCommon({chainId:id},Mainnet,{hardfork:Hardfork.Cancun});
const blockchain:any={getBlock:async()=>({hash:()=>hexToBytes(HASH as `0x${string}`)})};
const run=(from:string,to:string|undefined,d:string,value=0n)=>vm.evm.runCall({caller:createAddressFromString(from),...(to?{to:createAddressFromString(to)}:{}),data:hexToBytes(d as `0x${string}`),value,gasLimit:30000000n,block:{header:{timestamp:NOW,number:200n,gasLimit:30000000n,coinbase:createAddressFromString(user),baseFeePerGas:0n,prevRandao:new Uint8Array(32),difficulty:0n}}});
const deploy=(a:any,args:any[]=[])=>run(user,undefined,encodeDeployData({abi:a.abi,bytecode:`0x${a.evm.bytecode.object}`,args}));
const enc=(abi:any,fn:string,args:any[]=[])=>encodeFunctionData({abi,functionName:fn,args});
const call=(abi:any,to:string,fn:string,args:any[]=[],from=user,value=0n)=>run(from,to,enc(abi,fn,args),value);
async function ok(...a:Parameters<typeof call>){const x=await call(...a);expect(x.execResult.exceptionError).toBeUndefined();return x;}
async function read(abi:any,to:string,fn:string,args:any[]=[]){const x=await ok(abi,to,fn,args);return decodeFunctionResult({abi,functionName:fn,data:bytesToHex(x.execResult.returnValue)}) as any;}
const sel=(e:string)=>keccak256(new TextEncoder().encode(e)).slice(0,10);
const reverted=async(p:Promise<any>,error?:string)=>{const x=await p;expect(x.execResult.exceptionError).toBeDefined();if(error)expect(bytesToHex(x.execResult.returnValue).slice(0,10)).toBe(sel(error));return x;};
const native=async(a:string)=>(await vm.stateManager.getAccount(createAddressFromString(a)))?.balance??0n;
const bal=(t:string,a:string)=>read(t===w?W.abi:U.abi,t,'balanceOf',[a]);
const residual=async()=>[await native(adapter),await bal(w,adapter),await bal(u,adapter),await read(W.abi,w,'allowance',[adapter,r]),await read(U.abi,u,'allowance',[adapter,r])];
const ZERO=[0n,0n,0n,0n,0n];
const q=(sell:boolean,p:any={})=>({user,chainId:56n,tokenIn:sell?u:w,tokenOut:sell?w:u,router:r,poolFee:500,amountIn:sell?6n*E:E/100n,minNetOut:1n,deadline:NOW+30n,quotedAt:NOW,quoteBlock:199n,quoteBlockHash:HASH,...p});
const swap=(sell:boolean,p:any={},from=user,value?:bigint,at=adapter)=>call(A.abi,at,sell?'swapExactUsdtForBnb':'swapExactBnbForUsdt',[q(sell,p)],from,value??(sell?0n:(p.amountIn??E/100n)));
const userOut=(sell:boolean)=>sell?native(user):bal(u,user);
const feeOut=(sell:boolean)=>bal(sell?w:u,fee);
const grossOf=(sell:boolean,amt?:bigint)=>sell?(amt??6n*E)*(E/600n)/E:(amt??E/100n)*600n*E/E;
async function fresh(bps=5){const d=await deploy(A,[guardian,fee,bps]);expect(d.execResult.exceptionError).toBeUndefined();adapter=d.createdAddress.toString();await ok(U.abi,u,'approve',[adapter,10000n*E]);}
async function installRouter(a:any){await vm.stateManager.putCode(createAddressFromString(r),hexToBytes(`0x${a.evm.deployedBytecode.object}`));await ok(a.abi,r,'setRate',[w,600n*E]);await ok(a.abi,r,'setRate',[u,E/600n]);}
beforeEach(async()=>{
 vm=await createVM({common:common(),blockchain});
 for(const a of [user,other,guardian])await vm.stateManager.putAccount(createAddressFromString(a),new Account(0n,10n**25n));
 for(const [ad,a] of [[w,W],[u,U]] as const)await vm.stateManager.putCode(createAddressFromString(ad),hexToBytes(`0x${a.evm.deployedBytecode.object}`));
 await installRouter(R);
 await ok(U.abi,u,'mint',[user,10000n*E]);await ok(U.abi,u,'mint',[r,1000000n*E]);
 await ok(W.abi,w,'deposit',[],user,1000n*E);await ok(W.abi,w,'transfer',[r,1000n*E]);
 await fresh(5);
});
const DIRS=[false,true] as const; const name=(s:boolean)=>s?'USDT->BNB':'BNB->USDT';
describe('BOT V4 parity port — V1.13 frozen candidate (local mock EVM)',()=>{
 for(const sell of DIRS)for(const bps of [0,5,10])it(`[test_${sell?'TokenToNative':'NativeToToken'}_MultiPool_FeeOnce_NoResidue] ${name(sell)} ${bps}bps: fee once, exact net, one event, zero residual`,async()=>{
  await fresh(bps);const b=await userOut(sell),f=await feeOut(sell);const x=await swap(sell);expect(x.execResult.exceptionError).toBeUndefined();
  const g=grossOf(sell),fe=g*BigInt(bps)/10000n;expect(await userOut(sell)-b).toBe(g-fe);expect(await feeOut(sell)-f).toBe(fe);
  const evs=x.execResult.logs.filter((l:any)=>bytesToHex(l[0])===adapter.toLowerCase()).map((l:any)=>decodeEventLog({abi:A.abi,topics:l[1].map((t:Uint8Array)=>bytesToHex(t)),data:bytesToHex(l[2])}));
  expect(evs).toHaveLength(1);expect(evs[0].eventName).toBe('Swapped');expect(evs[0].args).toMatchObject({bnbToUsdt:!sell,amountIn:sell?6n*E:E/100n,grossOut:g,fee:fe,netOut:g-fe});
  expect((evs[0].args.user as string).toLowerCase()).toBe(user);expect(await residual()).toEqual(ZERO);});
 it('[test_FeeChangedAfterQuote_Reverts / test_FeeAboveUserMax_Reverts] BNB fee is constructor-immutable: no setter selector exists',async()=>{
  const fns=A.abi.filter((x:any)=>x.type==='function'&&x.stateMutability!=='view'&&x.stateMutability!=='pure').map((x:any)=>x.name).sort();
  expect(fns).toEqual(['setPaused','swapExactBnbForUsdt','swapExactUsdtForBnb']);expect(await read(A.abi,adapter,'FEE_BPS')).toBe(5);});
 it('[test_WrongMsgValue_Reverts] BNB->USDT msg.value must equal snapshot amountIn (both ways)',async()=>{await reverted(swap(false,{},user,E/100n+1n),'BadSnapshot()');await reverted(swap(false,{},user,E/100n-1n),'BadSnapshot()');});
 it('[test_WrongMsgValue_Reverts] USDT->BNB is nonpayable',async()=>{await reverted(swap(true,{},user,1n));expect(await residual()).toEqual(ZERO);});
 for(const sell of DIRS)it(`[test_ZeroAmount_Reverts] ${name(sell)} zero amount / zero minNetOut`,async()=>{await reverted(swap(sell,{amountIn:0n},user,0n),sell?'BadAmount()':'BadAmount()');await reverted(swap(sell,{minNetOut:0n}),'BadAmount()');});
 for(const sell of DIRS)it(`[test_ZeroRecipient_Reverts → adapted] ${name(sell)} output only to msg.sender; other accounts untouched`,async()=>{const o=sell?await native(other):await bal(u,other);expect((await swap(sell)).execResult.exceptionError).toBeUndefined();expect(sell?await native(other):await bal(u,other)).toBe(o);});
 for(const sell of DIRS)it(`[test_StaleDeadline_Reverts] ${name(sell)}`,async()=>{await reverted(swap(sell,{deadline:NOW-1n}),'Expired()');await reverted(swap(sell,{deadline:NOW+121n}),'DeadlineTooFar()');});
 for(const sell of DIRS)it(`[test_NativeIn_PathMustStartWithWBOT / test_NativeOut_PathMustEndWithWBOT → WBNB] ${name(sell)} fixed pair`,async()=>{
  for(const p of [{tokenIn:sell?w:u},{tokenOut:sell?u:w},{tokenIn:'0x21cAef8A43163Eea865baeE23b9C2E327696A3bf'},{tokenOut:'0x21cAef8A43163Eea865baeE23b9C2E327696A3bf'},{tokenIn:other,tokenOut:other}])await reverted(swap(sell,p),'BadSnapshot()');expect(await residual()).toEqual(ZERO);});
 for(const sell of DIRS)it(`[test_UnregisteredOrDisabledRouter / test_WrongRouterType] ${name(sell)} foreign router field rejected; router target is a constant`,async()=>{await reverted(swap(sell,{router:other}),'BadSnapshot()');expect((await read(A.abi,adapter,'ROUTER')).toLowerCase()).toBe(r.toLowerCase());});
 for(const sell of DIRS)for(const tier of [100,3000,10000,0])it(`[test_MalformedPath_Reverts → tier] ${name(sell)} tier ${tier} rejected`,async()=>{await reverted(swap(sell,{poolFee:tier}),'BadSnapshot()');});
 for(const sell of DIRS)for(const tier of [500,2500])it(`[tier parity] ${name(sell)} tier ${tier} forwarded exactly`,async()=>{expect((await swap(sell,{poolFee:tier})).execResult.exceptionError).toBeUndefined();expect(await read(R.abi,r,'lastTier')).toBe(tier);});
 for(const sell of DIRS)for(const bps of [0,5,10])it(`[test_AmountOutMinimum_Reverts_StateUnchanged] ${name(sell)} ${bps}bps exact NET floor passes, +1 rejects with state unchanged, router gets minimal gross floor`,async()=>{
  await fresh(bps);const g=grossOf(sell),net=g-g*BigInt(bps)/10000n;expect((await swap(sell,{minNetOut:net})).execResult.exceptionError).toBeUndefined();
  const floor=(net-1n)*10000n/BigInt(10000-bps)+1n;expect(await read(R.abi,r,'lastMinimum')).toBe(floor);
  const snap=[await userOut(sell),await feeOut(sell),await bal(u,user),await bal(w,r),await bal(u,r)];
  await reverted(swap(sell,{minNetOut:net+1n}));expect([await userOut(sell),await feeOut(sell),await bal(u,user),await bal(w,r),await bal(u,r)]).toEqual(snap);expect(await residual()).toEqual(ZERO);});
 for(const sell of DIRS)it(`[test_RouterIgnoringMin_StillEnforcedByFlowBridge] ${name(sell)}`,async()=>{await installRouter(IG);const b=await userOut(sell);await reverted(swap(sell,{minNetOut:grossOf(sell)*9n/10n}),'InsufficientOutput()');expect(await userOut(sell)).toBe(b);expect(await residual()).toEqual(ZERO);});
 it('[test_FeeOnTransferInput_Reverts] USDT->BNB input measured by delta',async()=>{await ok(U.abi,u,'setFee',[1n]);await reverted(swap(true),'InputMismatch()');expect(await residual()).toEqual(ZERO);});
 for(const sell of DIRS)it(`[test_MaliciousRouterPullingLess_RevertsResidual] ${name(sell)} under-pull -> AllowanceNotCleared, rollback`,async()=>{await ok(R.abi,r,'setMode',[2]);await reverted(swap(sell),'AllowanceNotCleared()');expect(await residual()).toEqual(ZERO);});
 for(const sell of DIRS)it(`[over-pull] ${name(sell)} router pulling more than approved fails`,async()=>{await ok(R.abi,r,'setMode',[3]);await reverted(swap(sell));expect(await residual()).toEqual(ZERO);});
 for(const sell of DIRS)for(const mode of [1,5,6,7])it(`[output delta mode ${mode}] ${name(sell)} non-delivery/over-delivery/in-callback donation/under-report rejected`,async()=>{await ok(R.abi,r,'setMode',[mode]);const b=await userOut(sell);await reverted(swap(sell));expect(await userOut(sell)).toBe(b);expect(await residual()).toEqual(ZERO);});
 for(const sell of DIRS)for(const target of DIRS)it(`[test_Reentrancy_Blocked] ${name(sell)} router reenters ${name(target)} -> Reentrancy()`,async()=>{await ok(R.abi,r,'setMode',[4]);await ok(R.abi,r,'setReentry',[enc(A.abi,target?'swapExactUsdtForBnb':'swapExactBnbForUsdt',[q(target)])]);expect((await swap(sell)).execResult.exceptionError).toBeUndefined();expect((await read(R.abi,r,'lastError')).slice(0,10)).toBe(sel('Reentrancy()'));expect(await residual()).toEqual(ZERO);});
 it('[test_Reentrancy_Blocked] router callback cannot pause mid-swap',async()=>{await ok(R.abi,r,'setMode',[4]);await ok(R.abi,r,'setReentry',[enc(A.abi,'setPaused',[true])]);expect((await swap(false)).execResult.exceptionError).toBeUndefined();expect((await read(R.abi,r,'lastError')).slice(0,10)).toBe(sel('Reentrancy()'));expect(await read(A.abi,adapter,'paused')).toBe(false);});
 it('[test_FailedBotDelivery_RevertsEverything → BNB] native-rejecting caller reverts and keeps USDT',async()=>{const h=(await deploy(H)).createdAddress.toString();await ok(H.abi,h,'setup',[adapter,'0x',true]);await ok(U.abi,u,'mint',[h,6n*E]);await reverted(call(H.abi,h,'execute',[u,enc(A.abi,'swapExactUsdtForBnb',[q(true,{user:h})]),6n*E]));expect(await bal(u,h)).toBe(6n*E);expect(await bal(w,fee)).toBe(0n);expect(await residual()).toEqual(ZERO);});
 it('[2300 stipend parity] contract caller with plain receive gets native net',async()=>{const h=(await deploy(H)).createdAddress.toString();await ok(H.abi,h,'setup',[adapter,'0x',false]);await ok(U.abi,u,'mint',[h,6n*E]);await ok(H.abi,h,'execute',[u,enc(A.abi,'swapExactUsdtForBnb',[q(true,{user:h})]),6n*E]);const g=grossOf(true);expect(await native(h)).toBe(g-g*5n/10000n);});
 for(const sell of DIRS)it(`[test_Paused_Reverts] ${name(sell)}`,async()=>{await ok(A.abi,adapter,'setPaused',[true],guardian);await reverted(swap(sell),'Paused()');await ok(A.abi,adapter,'setPaused',[false],guardian);expect((await swap(sell)).execResult.exceptionError).toBeUndefined();});
 it('[test_UnauthorizedAdministration_Reverts] only GUARDIAN may pause/unpause; user/fee recipient/router cannot',async()=>{for(const a of [user,other,fee,r])await reverted(call(A.abi,adapter,'setPaused',[true],a),'UnauthorizedGuardian()');});
 it('[test_NoBridgeProxyExecutionSelectorExists / test_RescueIsOwnerOnly → none] no arbitrary call, rescue, owner or registry selectors',async()=>{
  expect(A.abi.some((x:any)=>x.type==='function'&&x.inputs.some((i:any)=>i.type==='bytes'||i.type==='address'&&x.name!=='setPaused'))).toBe(false);
  for(const s of ['sweep()','rescue(address,uint256)','rescueToken(address,address,uint256)','transferOwnership(address)','setFee(uint16)','setFeeRecipient(address)','registerRouter(address,uint8,address)','multicall(bytes[])','execute(address,bytes)','upgradeTo(address)','swapNativeToTokenV3MultiSafe(uint256,address,bytes,uint256,uint256,address,uint256,uint256)'])await reverted(run(user,adapter,toFunctionSelector(s)),'UnexpectedNative()');});
 for(const sell of DIRS)it(`[test_ForcedBalancesNotUsableByCallers] ${name(sell)} donated native/WBNB/USDT never paid out`,async()=>{
  await ok(U.abi,u,'transfer',[adapter,123n]);await ok(W.abi,w,'deposit',[],user,456n);await ok(W.abi,w,'transfer',[adapter,456n]);const a=await vm.stateManager.getAccount(createAddressFromString(adapter));a.balance=77n;await vm.stateManager.putAccount(createAddressFromString(adapter),a);
  const before=await residual();const b=await userOut(sell);expect((await swap(sell)).execResult.exceptionError).toBeUndefined();const g=grossOf(sell);expect(await userOut(sell)-b).toBe(g-g*5n/10000n);expect(await residual()).toEqual(before);});
 for(const sell of DIRS)it(`[test_Regression_V3MultiSafe_ClearsAllowance_NoResidue / FailureRevertsAllowance] ${name(sell)}`,async()=>{expect((await swap(sell)).execResult.exceptionError).toBeUndefined();expect(await residual()).toEqual(ZERO);await ok(R.abi,r,'setMode',[1]);await reverted(swap(sell));expect(await residual()).toEqual(ZERO);});
 for(const sell of DIRS)it(`[wallet caller binding] ${name(sell)} snapshot for user cannot be used by another caller`,async()=>{await reverted(swap(sell,{},other),'BadSnapshot()');await reverted(swap(sell,{user:other}),'BadSnapshot()');expect(await read(U.abi,u,'allowance',[user,adapter])).toBe(10000n*E);});
 for(const sell of DIRS)for(const [n,p] of [['31s',{quotedAt:NOW-31n}],['future',{quotedAt:NOW+1n}],['101 blocks',{quoteBlock:99n}],['same block',{quoteBlock:200n}],['reorged hash',{quoteBlockHash:`0x${'22'.repeat(32)}`}],['wrong chain field',{chainId:677n}]] as const)it(`[stale quote] ${name(sell)} ${n} rejected`,async()=>{await reverted(swap(sell,p),'BadSnapshot()');});
 for(const sell of DIRS)it(`[stale quote boundary] ${name(sell)} exactly 30s and 100 blocks accepted`,async()=>{expect((await swap(sell,{quotedAt:NOW-30n,quoteBlock:100n})).execResult.exceptionError).toBeUndefined();});
 it('[wrong chain] deployment and both directions reject non-56',async()=>{vm=await createVM({common:common(677),stateManager:vm.stateManager,blockchain});await reverted(deploy(A,[guardian,fee,5]),'WrongChain()');for(const s of DIRS)await reverted(swap(s),'WrongChain()');});
 it('[seeded parity fuzz] 96 mixed-direction swaps at 0/5/10 bps keep exact fee/net accounting',async()=>{let seed=919;for(const bps of [0,5,10]){await fresh(bps);for(let i=0;i<32;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const sell=Boolean(seed&1);const amt=sell?BigInt(1+seed%900)*10n**15n:BigInt(1+seed%9000)*10n**12n;const b=await userOut(sell),f=await feeOut(sell);const g=grossOf(sell,amt),fe=g*BigInt(bps)/10000n;
  const x=await swap(sell,{amountIn:amt,poolFee:seed&2?2500:500,minNetOut:g-fe});expect(x.execResult.exceptionError).toBeUndefined();expect(await userOut(sell)-b).toBe(g-fe);expect(await feeOut(sell)-f).toBe(fe);expect(await residual()).toEqual(ZERO);}}},120000);
});
