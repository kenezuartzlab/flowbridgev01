import {createPublicClient,http,parseAbi,encodeFunctionData} from 'viem';
const c=createPublicClient({transport:http('http://127.0.0.1:8547')});
const address='0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922';
const signer='0x971e7790fe6c8f77dc666bb05d4aeda362653f94';
const abi=parseAbi(['function epochCount() view returns(uint256)','function isClaimed(uint256,uint256) view returns(bool)','function publishEpoch(bytes32,uint256,uint64,uint64) returns(uint256)']);
const block=await c.getBlock();
const data=encodeFunctionData({abi,functionName:'publishEpoch',args:['0x'+'a'.repeat(64),1000n*10n**18n,block.timestamp+700000n,block.timestamp+700000n+2592000n]});
const result=await c.call({account:signer,to:address,data});
console.log('Local fork eth_call simulation result',result.data,'epochs unchanged',String(await c.readContract({address,abi,functionName:'epochCount'})),'round1claimed',await c.readContract({address,abi,functionName:'isClaimed',args:[1n,0n]}),'round2claimed',await c.readContract({address,abi,functionName:'isClaimed',args:[2n,0n]}));
try{await c.call({account:'0x'+'1'.repeat(40),to:address,data});throw Error('Unauthorized accepted');}catch(e){if(String(e).includes('Unauthorized accepted'))throw e;console.log('Unauthorized fork publish eth_call rejected');}
