// Supplementary fixed-target mainnet reads; never signs or sends.
import {createPublicClient,http,parseAbi,decodeFunctionData,keccak256,formatUnits,type Address} from 'viem';
import {readFileSync,writeFileSync} from 'node:fs';
const j=JSON.parse(readFileSync('docs/security/caswap-correction/live.json','utf8'));const A=j.addresses,n=BigInt(j.pin.number);
const pc=createPublicClient({transport:http('https://rpc.botchain.ai',{timeout:20000,retryCount:0})});const ec=createPublicClient({transport:http('https://scan.botchain.ai/api/eth-rpc',{timeout:20000,retryCount:0})});
const abi=parseAbi(['function router() view returns(address)','function factory() view returns(address)','function feeToSetter() view returns(address)','function MAX_FEE_BPS() view returns(uint256)','function pairFeeBps(address,address) view returns(uint256)','function pairFeeReceivers(address,address) view returns(address)','function isFeeExempt(address) view returns(bool)','function feeExemptOn() view returns(bool)','function getPool(address,address,uint24) view returns(address)','function token0() view returns(address)','function token1() view returns(address)','function liquidity() view returns(uint128)','function balanceOf(address) view returns(uint256)','function registryActivationDelay() view returns(uint256)','function activationDelay() view returns(uint256)','function swapNativeToToken(uint256,address,uint24,uint256,address[],address,uint256) payable returns(uint256)','function swapTokenToNative(uint256,address,uint24,uint256,uint256,address[],address,uint256) returns(uint256)']);
const err=(e:any)=>String(e.shortMessage??e.message).slice(0,400);
const read=async(address:Address,fn:string,args:any[]=[])=>pc.readContract({address,abi,functionName:fn as any,args:args as any,blockNumber:n}).catch((e)=>({UNKNOWN:err(e)}));
const out:any={kind:'MAINNET_READ_ONLY',pin:j.pin,mainnetWrites:0,governance:{},sourceMatches:{},secondary:{},bdex:{},recentV3:[]};
for(const [name,address] of Object.entries({factory:j.venues.supplied.factory,pair:j.venues.supplied.pairs[0].pair}) as [string,Address][]){out.governance[name]={address,router:await read(address,'router'),factory:await read(address,'factory'),admin:await read(address,'feeToSetter')};}
for(const [from,to] of [[A.caWbot,A.ca],[A.ca,A.caWbot]])out.governance[`${from}->${to}`]={feeBps:await read(j.venues.supplied.factory,'pairFeeBps',[from,to]),feeReceiver:await read(j.venues.supplied.factory,'pairFeeReceivers',[from,to])};
out.governance.maxDirectionalFeeBps=await read(j.venues.supplied.factory,'MAX_FEE_BPS');out.governance.feeExemptOn=await read(j.venues.supplied.factory,'feeExemptOn');
for(const w of [A.wbot,A.caWbot])out.governance[`${w}-backing`]={native:await pc.getBalance({address:w,blockNumber:n}),balanceAtPair:await read(w,'balanceOf',[j.venues.supplied.pairs[0].pair])};
for(const a of [A.supplied,A.old,A.v3,j.venues.supplied.factory,j.venues.supplied.pairs[0].pair]){
 const source=JSON.parse(readFileSync(`docs/security/caswap-correction/source-${a.toLowerCase()}.json`,'utf8'));const live=await pc.getCode({address:a,blockNumber:n})??'0x';
 out.sourceMatches[a]={explorerVerified:source.is_verified,liveKeccak:keccak256(live),explorerRuntimeKeccak:source.deployed_bytecode?keccak256(source.deployed_bytecode):null,exact:source.deployed_bytecode===live,compiler:source.compiler_version};
 out.secondary[a]=await ec.getCode({address:a,blockNumber:n}).then(c=>({keccak:c?keccak256(c):null,exact:c===live})).catch(e=>({UNKNOWN:err(e)}));
}
out.governance.v4RegistryActivationDelay=await read(A.v4,'registryActivationDelay');
const factory=await read(A.bdex,'factory');out.bdex.factory=factory;
if(typeof factory==='string')for(const [t0,t1,fee] of [[A.ca,A.wbot,10000],[A.wbot,A.usdt,3000]]){
 const pool=await read(factory as Address,'getPool',[t0,t1,fee]);out.bdex[`${t0}->${t1}`]={pool,fee};if(typeof pool==='string'&&BigInt(pool)!==0n)out.bdex[`${t0}->${t1}`]={pool,fee,token0:await read(pool as Address,'token0'),token1:await read(pool as Address,'token1'),liquidity:await read(pool as Address,'liquidity'),tokenABalance:await read(t0,'balanceOf',[pool]),tokenBBalance:await read(t1,'balanceOf',[pool])};
}
for(const hash of ['0x268f5f425deab18b3f507efdf55c26b1d5ed6b0691479ae31985d286d26f66ba','0xec6abe508d81b8fb3415e5727c0b684fffcced7e083e3aa246b997812b3b9c24'] as const){
 try{const tx=await pc.getTransaction({hash}),r=await pc.getTransactionReceipt({hash});const d=decodeFunctionData({abi,data:tx.input});out.recentV3.push({hash,status:r.status,block:r.blockNumber,blockHash:r.blockHash,fn:d.functionName,args:d.args,value:tx.value,logs:r.logs.map(l=>({address:l.address,topics:l.topics,data:l.data}))});}catch(e){out.recentV3.push({hash,UNKNOWN:err(e)});}
}
// Decode old successful native paths; V3 V2 branch does not enforce registered wrappedNative.
const history=JSON.parse(readFileSync('docs/security/caswap-correction/history.json','utf8'));out.historicalV3Paths=history.receiptChecks.map((r:any)=>{try{const d=decodeFunctionData({abi,data:r.input});return {tx:r.tx,fn:d.functionName,args:d.args};}catch{return {tx:r.tx,UNKNOWN:'not native selector'}}});
const pinAfter=await pc.getBlock({blockNumber:n});out.pinStillCanonical=pinAfter.hash===j.pin.hash;
writeFileSync('docs/security/caswap-correction/detail.json',JSON.stringify(out,(_k,v)=>typeof v==='bigint'?v.toString():v,2));console.log(JSON.stringify(out,(_k,v)=>typeof v==='bigint'?v.toString():v,2));
