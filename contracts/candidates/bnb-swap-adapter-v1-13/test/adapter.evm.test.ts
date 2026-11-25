import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { createVM } from '@ethereumjs/vm';
import { createCustomCommon, Mainnet, Hardfork } from '@ethereumjs/common';
import { Account, createAddressFromString, bytesToHex, hexToBytes } from '@ethereumjs/util';
import { decodeFunctionResult, encodeDeployData, encodeFunctionData, keccak256 } from 'viem';
// @ts-expect-error pinned local compiler
import { compile } from '../scripts/compile.mjs';
const out=compile({'Mocks.sol':{content:fs.readFileSync('contracts/candidates/bnb-swap-adapter-v1-13/test/Mocks.sol','utf8')}});
const A=out['FlowBridgeBnbSwapAdapterV1_13.sol'].FlowBridgeBnbSwapAdapterV1_13;
const W=out['Mocks.sol'].MockWBNB,U=out['Mocks.sol'].MockUSDT,R=out['Mocks.sol'].MockRouter,H=out['Mocks.sol'].TestRecipient;
const w='0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',u='0x55d398326f99059fF775485246999027B3197955',r='0x1b81D678ffb9C0263b24A97847620C99d213eB14';
const user='0x00000000000000000000000000000000000000a1',other='0x00000000000000000000000000000000000000b2',guardian='0x00000000000000000000000000000000000000c3',fee='0x000000000000000000000000000000000f1b00fe';
const E=10n**18n,NOW=1800000000n,HASH=`0x${'11'.repeat(32)}`;
let vm:any,adapter='',hash=HASH;
const common=(id=56)=>createCustomCommon({chainId:id},Mainnet,{hardfork:Hardfork.Cancun});
const blockchain:any={getBlock:async()=>({hash:()=>hexToBytes(hash as `0x${string}`)})};
async function run(from:string,to:string|undefined,data:string,value=0n){return vm.evm.runCall({caller:createAddressFromString(from),...(to?{to:createAddressFromString(to)}:{}),data:hexToBytes(data as `0x${string}`),value,gasLimit:30000000n,block:{header:{timestamp:NOW,number:200n,gasLimit:30000000n,coinbase:createAddressFromString(user),baseFeePerGas:0n,prevRandao:new Uint8Array(32),difficulty:0n}}});}
async function deploy(a:any,args:any[]=[]){return run(user,undefined,encodeDeployData({abi:a.abi,bytecode:`0x${a.evm.bytecode.object}`,args}));}
const data=(abi:any,fn:string,args:any[]=[])=>encodeFunctionData({abi,functionName:fn,args});
async function call(abi:any,to:string,fn:string,args:any[]=[],from=user,value=0n){return run(from,to,data(abi,fn,args),value);}
async function ok(...args:Parameters<typeof call>){const x=await call(...args);expect(x.execResult.exceptionError).toBeUndefined();return x;}
async function read(abi:any,to:string,fn:string,args:any[]=[]){const x=await ok(abi,to,fn,args);return decodeFunctionResult({abi,functionName:fn,data:bytesToHex(x.execResult.returnValue)}) as any;}
const q=(sell=false,patch:any={})=>({user,chainId:56n,tokenIn:sell?u:w,tokenOut:sell?w:u,router:r,poolFee:500,amountIn:sell?6n*E:E/100n,minNetOut:1n,deadline:NOW+30n,quotedAt:NOW,quoteBlock:199n,quoteBlockHash:HASH,...patch});
const swap=(sell=false,patch:any={},from=user)=>call(A.abi,adapter,sell?'swapExactUsdtForBnb':'swapExactBnbForUsdt',[q(sell,patch)],from,sell?0n:(patch.amountIn??E/100n));
const reverted=async(p:Promise<any>,error?:string)=>{const x=await p;expect(x.execResult.exceptionError).toBeDefined();if(error)expect(bytesToHex(x.execResult.returnValue).slice(0,10)).toBe(keccak256(new TextEncoder().encode(error)).slice(0,10));};
const native=async(a:string)=>(await vm.stateManager.getAccount(createAddressFromString(a)))?.balance??0n;
const residual=async()=>[await native(adapter),await read(W.abi,w,'balanceOf',[adapter]),await read(U.abi,u,'balanceOf',[adapter]),await read(W.abi,w,'allowance',[adapter,r]),await read(U.abi,u,'allowance',[adapter,r])];
beforeEach(async()=>{
 hash=HASH;vm=await createVM({common:common(),blockchain});
 for(const a of [user,other,guardian])await vm.stateManager.putAccount(createAddressFromString(a),new Account(0n,10n**25n));
 for(const [address,a] of [[w,W],[u,U],[r,R]] as const)await vm.stateManager.putCode(createAddressFromString(address),hexToBytes(`0x${a.evm.deployedBytecode.object}`));
 await ok(R.abi,r,'setRate',[w,600n*E]);await ok(R.abi,r,'setRate',[u,E/600n]);
 await ok(U.abi,u,'mint',[user,10000n*E]);await ok(U.abi,u,'mint',[r,1000000n*E]);
 await ok(W.abi,w,'deposit',[],user,1000n*E);await ok(W.abi,w,'transfer',[r,1000n*E]);
 const d=await deploy(A,[guardian,fee,5]);expect(d.execResult.exceptionError).toBeUndefined();adapter=d.createdAddress.toString();
 await ok(U.abi,u,'approve',[adapter,10000n*E]);
});
describe('V1.12 local-only safety candidate',()=>{
 it('differential: frozen V1.11 passes only one wei router floor for a meaningful net minimum',async()=>{const old=await import('../../bnb-swap-adapter-v1-11/scripts/compile.mjs');const prior=old.compile()['FlowBridgeBnbSwapAdapterV1_11.sol'].FlowBridgeBnbSwapAdapterV1_11;const a=(await deploy(prior,[guardian,fee,5])).createdAddress.toString();await ok(prior.abi,a,'swapExactBnbForUsdt',[q(false,{minNetOut:5n*E})],user,E/100n);expect(await read(R.abi,r,'lastMinimum')).toBe(1n);});
 it('differential: frozen V1.11 accepts itself as guardian, an unusable pause configuration',async()=>{const old=await import('../../bnb-swap-adapter-v1-11/scripts/compile.mjs');const prior=old.compile()['FlowBridgeBnbSwapAdapterV1_11.sol'].FlowBridgeBnbSwapAdapterV1_11;const nonce=(await vm.stateManager.getAccount(createAddressFromString(user))).nonce;const {getContractAddress}=await import('viem');const predicted=getContractAddress({from:user,nonce});const x=await deploy(prior,[predicted,fee,5]);expect(x.execResult.exceptionError).toBeUndefined();expect((await read(prior.abi,x.createdAddress.toString(),'GUARDIAN')).toLowerCase()).toBe(predicted.toLowerCase());});
 for(const tier of [500,2500])for(const sell of [false,true])it(`settles ${sell?'USDT->BNB':'BNB->USDT'} tier ${tier}, fee/net and zero residuals`,async()=>{
  const before= sell?await native(user):await read(U.abi,u,'balanceOf',[user]);const feeBefore=await read(sell?W.abi:U.abi,sell?w:u,'balanceOf',[fee]);
  const x=await swap(sell,{poolFee:tier});expect(x.execResult.exceptionError).toBeUndefined();
  const gross=sell?(6n*E)*(E/600n)/E:6n*E;const f=gross*5n/10000n;
  expect((sell?await native(user):await read(U.abi,u,'balanceOf',[user]))-before).toBe(gross-f);
  expect(await read(sell?W.abi:U.abi,sell?w:u,'balanceOf',[fee])-feeBefore).toBe(f);
  expect(await read(R.abi,r,'lastTier')).toBe(tier);expect(await residual()).toEqual([0n,0n,0n,0n,0n]);
 });
 for(const bps of [0,5,10])it(`constructor accepts proposal ${bps} bps without approval`,async()=>{const d=await deploy(A,[guardian,fee,bps]);expect(d.execResult.exceptionError).toBeUndefined();});
 it('rejects fee outside 0/5/10',async()=>{await reverted(deploy(A,[guardian,fee,11]),'BadConfig()');});
 it('rejects zero guardian',async()=>{await reverted(deploy(A,['0x0000000000000000000000000000000000000000',fee,5]),'BadConfig()');});
 it('rejects zero treasury',async()=>{await reverted(deploy(A,[guardian,'0x0000000000000000000000000000000000000000',5]),'BadConfig()');});
 const bad:[string,any][]=[['wrong snapshot chain',{chainId:677n}],['XAUt token',{tokenIn:'0x21cAef8A43163Eea865baeE23b9C2E327696A3bf'}],['wrong output token',{tokenOut:w}],['foreign router',{router:other}],['unknown tier',{poolFee:10000}],['cross-wallet snapshot',{user:other}],['mismatched input',{amountIn:0n}],['31-second old',{quotedAt:NOW-31n}],['future quote',{quotedAt:NOW+1n}],['current block',{quoteBlock:200n}],['101-block old',{quoteBlock:99n}],['reorg hash',{quoteBlockHash:`0x${'22'.repeat(32)}`}],['zero hash',{quoteBlockHash:`0x${'00'.repeat(32)}`}]];
 for(const [name,patch] of bad)it(`rejects ${name}`,async()=>{await reverted(swap(false,patch));expect(await residual()).toEqual([0n,0n,0n,0n,0n]);});
 it('rejects expired deadline',async()=>{await reverted(swap(false,{deadline:NOW-1n}),'Expired()');});
 it('rejects deadline beyond 120 seconds',async()=>{await reverted(swap(false,{deadline:NOW+121n}),'DeadlineTooFar()');});
 it('rejects amount over one BNB',async()=>{await reverted(swap(false,{amountIn:E+1n}),'BadAmount()');});
 it('rejects USDT over 1000',async()=>{await reverted(swap(true,{amountIn:1000n*E+1n}),'BadAmount()');});
 it('minimum net exact passes; +1 wei rejects and refunds',async()=>{const net=6n*E-6n*E*5n/10000n;expect((await swap(false,{minNetOut:net})).execResult.exceptionError).toBeUndefined();const before=await native(user);await reverted(swap(false,{minNetOut:net+1n}));expect(await native(user)).toBe(before);});
 it('changed pool cannot bypass net minimum',async()=>{await ok(R.abi,r,'setRate',[w,500n*E]);await reverted(swap(false,{minNetOut:6n*E-3n*10n**15n}));});
 it('guardian pause stops both directions; unauthorized unpause fails; guardian resumes',async()=>{await ok(A.abi,adapter,'setPaused',[true],guardian);await reverted(swap(false),'Paused()');await reverted(swap(true),'Paused()');await reverted(call(A.abi,adapter,'setPaused',[false],user),'UnauthorizedGuardian()');await ok(A.abi,adapter,'setPaused',[false],guardian);expect((await swap()).execResult.exceptionError).toBeUndefined();});
 it('unauthorized pause fails',async()=>{await reverted(call(A.abi,adapter,'setPaused',[true],other),'UnauthorizedGuardian()');expect(await read(A.abi,adapter,'paused')).toBe(false);});
 it('router callback cannot reenter',async()=>{await ok(R.abi,r,'setMode',[4]);await ok(R.abi,r,'setReentry',[data(A.abi,'swapExactBnbForUsdt',[q()])]);expect((await swap()).execResult.exceptionError).toBeUndefined();expect((await read(R.abi,r,'lastError')).slice(0,10)).toBe(keccak256(new TextEncoder().encode('Reentrancy()')).slice(0,10));});
 for(const mode of [1,2,3,5])it(`malicious router mode ${mode} reverts atomically`,async()=>{await ok(R.abi,r,'setMode',[mode]);const before=await native(user);await reverted(swap());expect(await native(user)).toBe(before);expect(await residual()).toEqual([0n,0n,0n,0n,0n]);});
 it('fee-on-transfer rejected',async()=>{await ok(U.abi,u,'setFee',[1n]);await reverted(swap(true),'InputMismatch()');});
 it('native rejecting user preserves all token inputs on failure',async()=>{const d=await deploy(H);const h=d.createdAddress.toString();await ok(H.abi,h,'setup',[adapter,'0x',true]);await ok(U.abi,u,'mint',[h,6n*E]);const before=await read(U.abi,u,'balanceOf',[h]);await reverted(call(H.abi,h,'execute',[u,data(A.abi,'swapExactUsdtForBnb',[q(true,{user:h})]),6n*E]));expect(await read(U.abi,u,'balanceOf',[h])).toBe(before);expect(await residual()).toEqual([0n,0n,0n,0n,0n]);});
 it('payout receive-hook cannot reenter',async()=>{const h=(await deploy(H)).createdAddress.toString();await ok(H.abi,h,'setup',[adapter,data(A.abi,'swapExactBnbForUsdt',[q(false,{user:h})]),false]);await ok(U.abi,u,'mint',[h,6n*E]);await ok(H.abi,h,'execute',[u,data(A.abi,'swapExactUsdtForBnb',[q(true,{user:h})]),6n*E]);expect((await read(H.abi,h,'lastError')).slice(0,10)).toBe(keccak256(new TextEncoder().encode('Reentrancy()')).slice(0,10));});
 it('cross-wallet cannot consume an approved user input',async()=>{await reverted(swap(true,{user:other},other));expect(await read(U.abi,u,'allowance',[user,adapter])).toBe(10000n*E);});
 it('forced native and token donations stay unchanged, cannot be swept',async()=>{await ok(U.abi,u,'transfer',[adapter,123n]);const a=await vm.stateManager.getAccount(createAddressFromString(adapter));a.balance=77n;await vm.stateManager.putAccount(createAddressFromString(adapter),a);const before=await residual();expect((await swap()).execResult.exceptionError).toBeUndefined();expect(await residual()).toEqual(before);await reverted(run(user,adapter,keccak256(new TextEncoder().encode('sweep()')).slice(0,10)));});
 it('deployment and swaps reject chain 677',async()=>{vm=await createVM({common:common(677),stateManager:vm.stateManager,blockchain});await reverted(deploy(A,[guardian,fee,5]),'WrongChain()');await reverted(swap(),'WrongChain()');await reverted(call(A.abi,adapter,'setPaused',[true],guardian),'WrongChain()');});
 it('128 seeded alternating swaps/tier changes preserve residual and allowance deltas',async()=>{let seed=111;for(let i=0;i<128;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const sell=Boolean(i%2);const amount=sell?BigInt(1+seed%1000)*10n**15n:BigInt(1+seed%10000)*10n**12n;const before=await residual();expect((await swap(sell,{poolFee:i%3?500:2500,amountIn:amount})).execResult.exceptionError).toBeUndefined();expect(await residual()).toEqual(before);}},120000);
 for(const [token,abi,point,sell] of [[w,W.abi,1,false],[w,W.abi,2,true],[w,W.abi,3,false],[u,U.abi,3,true],[u,U.abi,4,true],[u,U.abi,5,false]] as const)for(const action of ['swapExactBnbForUsdt','swapExactUsdtForBnb','setPaused'])it(`token callback ${token} point ${point} cannot ${action}`,async()=>{const payload=action==='setPaused'?data(A.abi,action,[true]):data(A.abi,action,[q(action==='swapExactUsdtForBnb')]);await ok(abi,token,'setHook',[adapter,payload,point]);expect((await swap(sell)).execResult.exceptionError).toBeUndefined();expect((await read(abi,token,'hookError')).slice(0,10)).toBe(keccak256(new TextEncoder().encode('Reentrancy()')).slice(0,10));expect(await residual()).toEqual([0n,0n,0n,0n,0n]);expect(await read(A.abi,adapter,'paused')).toBe(false);});
 for(const mode of [1,3])it(`unsafe approval return ${mode} reverts and refunds`,async()=>{await ok(W.abi,w,'setReply',[mode]);const before=await native(user);await reverted(swap());expect(await native(user)).toBe(before);expect(await residual()).toEqual([0n,0n,0n,0n,0n]);});
 it('empty successful approve return is accepted with exact allowance consumption',async()=>{await ok(W.abi,w,'setReply',[2]);expect((await swap()).execResult.exceptionError).toBeUndefined();expect(await residual()).toEqual([0n,0n,0n,0n,0n]);});
 it('false transfer and blocked fee recipient revert without retaining inputs',async()=>{await ok(U.abi,u,'setReturnFalse',[true]);await reverted(swap());await ok(U.abi,u,'setReturnFalse',[false]);await ok(U.abi,u,'setBlocked',[fee,true]);const before=await native(user);await reverted(swap());expect(await native(user)).toBe(before);expect(await residual()).toEqual([0n,0n,0n,0n,0n]);});
 it('direct native sends and router refund attempts fail closed',async()=>{await reverted(run(user,adapter,'0x',1n),'UnexpectedNative()');await reverted(run(r,adapter,'0x',1n));});
 it('V1.12 router receives exact gross floor for net minimum, including 10 bps rounding',async()=>{for(const bps of [0,5,10]){const a=(await deploy(A,[guardian,fee,bps])).createdAddress.toString();const net=5n*E+7n;await ok(A.abi,a,'swapExactBnbForUsdt',[q(false,{minNetOut:net})],user,E/100n);const floor=(net-1n)*10000n/BigInt(10000-bps)+1n;expect(await read(R.abi,r,'lastMinimum')).toBe(floor);expect(floor-floor*BigInt(bps)/10000n).toBeGreaterThanOrEqual(net);expect((floor-1n)-(floor-1n)*BigInt(bps)/10000n).toBeLessThan(net);}});
 it('V1.12 router-level floor rejects price movement before fee settlement',async()=>{await ok(R.abi,r,'setRate',[w,500n*E]);await reverted(swap(false,{minNetOut:5n*E+1n}));expect(await residual()).toEqual([0n,0n,0n,0n,0n]);});
 it('balance isolation rejects callback donation and under-reported output',async()=>{for(const mode of [6,7]){await ok(R.abi,r,'setMode',[mode]);await reverted(swap(),'InputMismatch()');expect(await residual()).toEqual([0n,0n,0n,0n,0n]);}});
 it('V1.12 rejects adapter as its own guardian',async()=>{const nonce=(await vm.stateManager.getAccount(createAddressFromString(user))).nonce;const {getContractAddress}=await import('viem');const predicted=getContractAddress({from:user,nonce});const x=await deploy(A,[predicted,fee,5]);await reverted(Promise.resolve(x),'BadConfig()');});
 it('guardian cannot move funds or call swap on behalf of users',async()=>{await reverted(swap(true,{},guardian),'BadSnapshot()');await ok(A.abi,adapter,'setPaused',[true],guardian);await ok(A.abi,adapter,'setPaused',[true],guardian);expect(await read(U.abi,u,'allowance',[user,adapter])).toBe(10000n*E);});
 it('freeze and ABI match compiled artifact; no arbitrary execution/admin setters',()=>{const m=JSON.parse(fs.readFileSync('contracts/candidates/bnb-swap-adapter-v1-13/MANIFEST.json','utf8'));expect(m.abi).toEqual(A.abi);expect(m.sourceKeccak).toBe(keccak256(fs.readFileSync('contracts/candidates/bnb-swap-adapter-v1-13/FlowBridgeBnbSwapAdapterV1_13.sol')));for(const name of ['sweep','setFee','setTreasury','setRouter','setGuardian','upgradeTo','swapExactTokensForTokens'])expect(A.abi.filter((x:any)=>x.type==='function').map((x:any)=>x.name)).not.toContain(name);});
});
