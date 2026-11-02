import { describe,it,expect,beforeEach } from 'vitest';
import { createVM } from '@ethereumjs/vm';
import { Account, createAddressFromString, bytesToHex, hexToBytes } from '@ethereumjs/util';
import { encodeDeployData, encodeFunctionData, decodeFunctionResult } from 'viem';
import { compile } from '../scripts/compile.mjs';
const mock=`// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;
contract Token { mapping(address=>uint) public balanceOf; uint8 public decimals=18; bool public fee; bool public attack; address public target;
function mint(address a,uint n) external {balanceOf[a]+=n;} function setFee(bool v) external {fee=v;} function setAttack(address v) external {target=v;attack=true;}
function transfer(address a,uint n) external returns(bool) {balanceOf[msg.sender]-=n;balanceOf[a]+=fee?n-1:n;if(attack){(bool ok,)=target.call(abi.encodeWithSignature("claim()"));require(!ok,"reentered");}return true;}}
`;
const compiled=compile({'Token.sol':{content:mock}});
const artifact=compiled['FlowRewardsVaultV2.sol'].FlowRewardsVaultV2;
const tokenArtifact=compiled['Token.sol'].Token;
const admin='0x0000000000000000000000000000000000000001';
const publisher='0x0000000000000000000000000000000000000002';
const user='0x0000000000000000000000000000000000000003';
const other='0x0000000000000000000000000000000000000004';
const unit=10n**18n;
const id=(n:number)=>`0x${n.toString(16).padStart(64,'0')}`;
let vm:any,token:any,vault:any,day=10n;
async function call(from:string,to:string|undefined,data:string){const r=await vm.evm.runCall({caller:createAddressFromString(from),...(to?{to:createAddressFromString(to)}:{}),data:hexToBytes(data as any),gasLimit:30_000_000n,block:{header:{timestamp:day*86400n+1n,number:1n,gasLimit:30_000_000n,coinbase:createAddressFromString(admin),baseFeePerGas:0n,prevRandao:new Uint8Array(32),difficulty:0n}}});return r;}
async function tx(name:string,args:any[]=[],from=publisher,to=vault,abi=artifact.abi){return call(from,to,encodeFunctionData({abi,functionName:name,args}));}
async function ok(name:string,args:any[]=[],from=publisher,to=vault,abi=artifact.abi){const r=await tx(name,args,from,to,abi);expect(r.execResult.exceptionError?.error).toBeUndefined();return r;}
async function bad(name:string,args:any[]=[],from=publisher,to=vault,abi=artifact.abi){expect((await tx(name,args,from,to,abi)).execResult.exceptionError).toBeDefined();}
async function read(name:string,args:any[]=[],to=vault,abi=artifact.abi){const r=await ok(name,args,admin,to,abi);return decodeFunctionResult({abi,functionName:name,data:bytesToHex(r.execResult.returnValue)});}
async function credit(n:number,amount=100n*unit,w=user){return ok('creditBatch',[id(n),[w],[amount]]);}
beforeEach(async()=>{vm=await createVM();day=10n;for(const a of [admin,publisher,user,other])await vm.stateManager.putAccount(createAddressFromString(a),new Account(0n,10n**30n));
 const t=await call(admin,undefined,encodeDeployData({abi:tokenArtifact.abi,bytecode:`0x${tokenArtifact.evm.bytecode.object}`}));expect(t.execResult.exceptionError).toBeUndefined();token=t.createdAddress.toString();
 const v=await call(admin,undefined,encodeDeployData({abi:artifact.abi,bytecode:`0x${artifact.evm.bytecode.object}`,args:[token,admin,publisher]}));expect(v.execResult.exceptionError).toBeUndefined();vault=v.createdAddress.toString();
 await ok('mint',[vault,10_000n*unit],admin,token,tokenArtifact.abi);await ok('setLimits',[1000n*unit,2000n*unit],admin);await ok('unpause',[],admin);
});
describe('Vault V2 executed Solidity',()=>{
 it('frozen runtime stays below EIP-170 and deployment fits current BOT block limit',async()=>{expect(artifact.evm.deployedBytecode.object.length/2).toBe(5615);expect(artifact.evm.deployedBytecode.object.length/2).toBeLessThan(24576);const data=encodeDeployData({abi:artifact.abi,bytecode:`0x${artifact.evm.bytecode.object}`,args:[token,admin,publisher]});const r=await call(admin,undefined,data);expect(r.execResult.exceptionError).toBeUndefined();const intrinsic=53000n+BigInt((data.slice(2).match(/../g)??[]).reduce((n,b)=>n+(b==='00'?4:16),0))+2n*BigInt(Math.ceil((data.length-2)/2/32));const total=r.execResult.executionGasUsed+intrinsic;console.log('Deployment execution / intrinsic-inclusive gas',r.execResult.executionGasUsed.toString(),total.toString());expect(total).toBeLessThan(35000000n);const address=r.createdAddress.toString();expect(await read('paused',[],address)).toBe(true);expect(await read('batchCap',[],address)).toBe(0n);expect(await read('dailyCap',[],address)).toBe(0n);});
 it('rejects 101 recipients',async()=>{const wallets=Array.from({length:101},(_,i)=>`0x${(i+10).toString(16).padStart(40,'0')}`);await bad('creditBatch',[id(1),wallets,wallets.map(()=>unit)]);expect(await read('processedBatch',[id(1)])).toBe(false);});
 it('exact prefunding allows credit and claim leaving zero backing and liabilities',async()=>{await ok('recoverSurplus',[admin,9900n*unit],admin);await credit(1);expect(await read('freeBalance')).toBe(0n);await ok('claim',[],user);expect(await read('balanceOf',[vault],token,tokenArtifact.abi)).toBe(0n);expect(await read('totalLiabilities')).toBe(0n);});
 it('constructor rejects absent token and identical admin/publisher',async()=>{for(const args of [[other,admin,publisher],[token,admin,admin]]){const r=await call(admin,undefined,encodeDeployData({abi:artifact.abi,bytecode:`0x${artifact.evm.bytecode.object}`,args}));expect(r.execResult.exceptionError).toBeDefined();}});
 it('accumulates batches and one full own-wallet claim',async()=>{await credit(1);await credit(2,50n*unit);expect(await read('claimable',[user])).toBe(150n*unit);await ok('claim',[],user);expect(await read('balanceOf',[user],token,tokenArtifact.abi)).toBe(150n*unit);expect(await read('totalLiabilities')).toBe(0n);});
 it('cannot claim another wallet',async()=>{await credit(1);await bad('claim',[],other);expect(await read('claimable',[user])).toBe(100n*unit);});
 it('does not double claim',async()=>{await credit(1);await ok('claim',[],user);await bad('claim',[],user);});
 it('rejects batch replay',async()=>{await credit(1);await bad('creditBatch',[id(1),[user],[unit]]);});
 it('rejects duplicate recipients',async()=>await bad('creditBatch',[id(1),[user,user],[unit,unit]]));
 it('rejects zero wallet',async()=>await bad('creditBatch',[id(1),[id(0).slice(0,42)],[unit]]));
 it('rejects zero credit',async()=>await bad('creditBatch',[id(1),[user],[0n]]));
 it('rejects malformed inputs',async()=>await bad('creditBatch',[id(1),[user],[]]));
 it('caps per batch at configured 1000 FLOW',async()=>await bad('creditBatch',[id(1),[user],[1001n*unit]]));
 it('caps each UTC day at 2000 FLOW and resets boundary',async()=>{await credit(1,1000n*unit);await credit(2,1000n*unit);await bad('creditBatch',[id(3),[user],[unit]]);day++;await credit(3,unit);});
 it('requires actual free FLOW not configured budget',async()=>{await ok('recoverSurplus',[admin,9999n*unit],admin);await bad('creditBatch',[id(1),[user],[2n*unit]]);});
 it('pause blocks claims and credits',async()=>{await credit(1);await ok('pause',[],admin);await bad('claim',[],user);await bad('creditBatch',[id(2),[user],[unit]]);});
 it('only publisher credits',async()=>await bad('creditBatch',[id(1),[user],[unit]],admin));
 it('only admin changes limits and pause',async()=>{await bad('setLimits',[unit,unit],publisher);await bad('pause',[],publisher);});
 it('rotates publisher and blocks previous signer',async()=>{await ok('setPublisher',[other],admin);await bad('creditBatch',[id(1),[user],[unit]]);await ok('creditBatch',[id(1),[user],[unit]],other);});
 it('admin/publisher remain distinct across two-step ownership',async()=>{await bad('transferOwnership',[publisher],admin);await ok('transferOwnership',[other],admin);expect(await read('owner')).toBe(admin);await ok('acceptOwnership',[],other);expect(await read('owner')).toBe(other);await bad('setPublisher',[other],other);});
 it('surplus recovery cannot steal liabilities',async()=>{await credit(1);await bad('recoverSurplus',[admin,9901n*unit],admin);await ok('recoverSurplus',[admin,9900n*unit],admin);await ok('claim',[],user);});
 it('fee-on-transfer reverts and restores liability',async()=>{await credit(1);await ok('setFee',[true],admin,token,tokenArtifact.abi);await bad('claim',[],user);expect(await read('claimable',[user])).toBe(100n*unit);expect(await read('totalLiabilities')).toBe(100n*unit);});
 it('reentrancy is blocked during external transfer',async()=>{await credit(1);await ok('setAttack',[vault],admin,token,tokenArtifact.abi);await ok('claim',[],user);expect(await read('totalLiabilities')).toBe(0n);});
 it('100 recipients executes within 8 million gas',async()=>{const wallets=Array.from({length:100},(_,i)=>`0x${(i+10).toString(16).padStart(40,'0')}`);const args=[id(1),wallets,wallets.map(()=>unit)];const r=await ok('creditBatch',args);const data=encodeFunctionData({abi:artifact.abi,functionName:'creditBatch',args});const total=r.execResult.executionGasUsed+21000n+BigInt((data.slice(2).match(/../g)??[]).reduce((n,b)=>n+(b==='00'?4:16),0));console.log('100 recipient execution / intrinsic-inclusive gas',r.execResult.executionGasUsed.toString(),total.toString());expect(total).toBeLessThan(8_000_000n);});
 it('property: liabilities equal sum of accumulated credits less claims',async()=>{let total=0n;for(let i=1;i<=12;i++){const amount=BigInt((i*7919)%90+1)*unit;await credit(i,amount,i%2?user:other);total+=amount;expect(await read('totalLiabilities')).toBe(total);}const claimed=await read('claimable',[user]) as bigint;await ok('claim',[],user);expect(await read('totalLiabilities')).toBe(total-claimed);expect(await read('freeBalance')).toBe(10_000n*unit-total);});
});
