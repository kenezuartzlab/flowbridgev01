// Offline diagnostic only. All external transports allow read methods only.
import { createPublicClient, http, parseAbi, keccak256, getAddress, isAddress, toFunctionSelector, formatUnits, type Address } from 'viem';
import { writeFileSync } from 'node:fs';
const P='https://rpc.botchain.ai', E='https://scan.botchain.ai/api/eth-rpc';
const pc=createPublicClient({transport:http(P,{timeout:20000,retryCount:0})});
const ec=createPublicClient({transport:http(E,{timeout:20000,retryCount:0})});
const A=(s:string)=>getAddress(s.toLowerCase());
const addresses={ supplied:A('0xe3c1bCEF83C23331593f38B85e16Cf172C022737'), old:A('0x5b90611D4eB8FC82Fc2E3d1F0501Dd6F434441AD'), v3:A('0x986962de6F00D0eC571b1a34Fa70AEeB445b5445'), v4:A('0x79653140D84B78C19354ee984f236Ec92160fc61'), ca:A('0x546307af427902a75771434df831d88219784e19'), usdt:A('0xababc7ddc03e501d190c676bf3d92ef0e6e87a3c'), wbot:A('0xd5452816194a3784dba983426cce7c122f4abd30'), caWbot:A('0x68caea9104419203cf8b8f0b222e75709b97bfc6'), bdex:A('0x07032d47A1b9f8460cBeE9dC17c1d3E438693929'), quoter:A('0x034A705b36067cFF99AbF5C662BE881cbd8D0176')};
const abi=parseAbi(['function owner() view returns(address)','function factory() view returns(address)','function WETH() view returns(address)','function WBOT() view returns(address)','function routerCount() view returns(uint256)','function routers(uint256) view returns(address,uint8,address,bool,string,string)','function getActiveRouters() view returns(uint256[],string[],string[],uint8[],address[])','function getPair(address,address) view returns(address)','function token0() view returns(address)','function token1() view returns(address)','function getReserves() view returns(uint112,uint112,uint32)','function decimals() view returns(uint8)','function totalSupply() view returns(uint256)','function balanceOf(address) view returns(uint256)','function getAmountsOut(uint256,address[]) view returns(uint256[])','function globalFeeBps() view returns(uint256)','function routerFeeBps(uint256) view returns(uint256)','function routerActivationDelay() view returns(uint256)']);
const out:any={generatedAt:new Date().toISOString(),kind:'MAINNET_READ_ONLY',mainnetWrites:0,endpoints:[P,E],addresses,checksums:{suppliedCanonical:addresses.supplied,suppliedValid:isAddress('0xe3c1bCEF83C23331593f38B85e16Cf172C022737',{strict:true})},contracts:{},venues:{},errors:[]};
const err=(e:any)=>String(e.shortMessage??e.message).slice(0,500);
const head1=await pc.getBlock(), head2=await ec.getBlock();
const requested=process.env['CASWAP_AUDIT_BLOCK'];
const n=requested?BigInt(requested):(head1.number<head2.number?head1.number:head2.number);
const [b,b2]=await Promise.all([pc.getBlock({blockNumber:n}),ec.getBlock({blockNumber:n})]);
out.pin={number:n,hash:b.hash,time:new Date(Number(b.timestamp)*1000).toISOString(),chainId:await pc.getChainId(),secondaryChainId:await ec.getChainId().catch((e)=>({UNKNOWN:err(e)})),secondaryHash:b2.hash,consensus:b.hash===b2.hash};
if(out.pin.chainId!==677||(typeof out.pin.secondaryChainId==='number'&&out.pin.secondaryChainId!==677)||!out.pin.consensus) throw Error('PIN_CONSENSUS_FAILED');
async function read(address:Address,fn:string,args:any[]=[]){try{return await pc.readContract({address,abi,functionName:fn as any,args:args as any,blockNumber:n});}catch(e){return {UNKNOWN:err(e)}}}
async function code(address:Address){const c=await pc.getCode({address,blockNumber:n})??'0x';return {bytes:(c.length-2)/2,keccak:keccak256(c),code:c};}
const sels=['factory()','WETH()','WBOT()','getAmountsOut(uint256,address[])','swapExactETHForTokens(uint256,address[],address,uint256)','swapExactTokensForETH(uint256,uint256,address[],address,uint256)','swapExactTokensForTokens(uint256,uint256,address[],address,uint256)','swapExactETHForTokensSupportingFeeOnTransferTokens(uint256,address[],address,uint256)','swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)','deposit()','withdraw(uint256)'];
for(const [name,a] of Object.entries(addresses)){
 const c=await code(a);out.contracts[name]={address:a,bytes:c.bytes,keccak:c.keccak,selectors:Object.fromEntries(sels.map(s=>[s,{selector:toFunctionSelector(s),present:c.code.includes(toFunctionSelector(s).slice(2))}]))};
}
for(const name of ['v3','v4'] as const){const a=addresses[name];const count=await read(a,'routerCount');const rows=[];if(typeof count==='bigint'&&count<30n)for(let i=0n;i<count;i++)rows.push({id:i,entry:await read(a,'routers',[i]),fee:await read(a,'routerFeeBps',[i])});out.contracts[name].registry={owner:await read(a,'owner'),count,active:await read(a,'getActiveRouters'),globalFeeBps:await read(a,'globalFeeBps'),activationDelay:await read(a,'routerActivationDelay'),rows};}
for(const name of ['supplied','old'] as const){
 const router=addresses[name],factory=await read(router,'factory'),weth=await read(router,'WETH'),wbot=await read(router,'WBOT');
 const venue:any={router,factory,weth,wbot,pairs:[],quotes:[]};out.venues[name]=venue;
 if(typeof factory!=='string')continue;
 venue.factoryCode=await code(factory as Address);delete venue.factoryCode.code;
 const wraps=[...new Set([weth,wbot,addresses.wbot,addresses.caWbot].filter((x):x is Address=>typeof x==='string'))];
 for(const w of wraps){
   venue[w]={decimals:await read(w,'decimals'),supply:await read(w,'totalSupply'),nativeBacking:await pc.getBalance({address:w,blockNumber:n}),code:(()=>null)()};
   for(const [a,z] of [[addresses.ca,w],[w,addresses.usdt],[addresses.ca,addresses.usdt]] as [Address,Address][]){
    if(venue.pairs.some((x:any)=>x.a===a&&x.b===z))continue;
    const pair=await read(factory as Address,'getPair',[a,z]);const row:any={a,b:z,pair};venue.pairs.push(row);
    if(typeof pair!=='string'||BigInt(pair)===0n)continue;
    row.token0=await read(pair as Address,'token0');row.token1=await read(pair as Address,'token1');row.reserves=await read(pair as Address,'getReserves');
    row.code=await code(pair as Address);delete row.code.code;
    if(typeof row.token0==='string'&&typeof row.token1==='string'&&Array.isArray(row.reserves)){
      row.decimals=[await read(row.token0,'decimals'),await read(row.token1,'decimals')];
      if(row.decimals.every((d:any)=>typeof d==='number'))row.normalized=[formatUnits(row.reserves[0],row.decimals[0]),formatUnits(row.reserves[1],row.decimals[1])];
    }
   }
   for(const [from,to,ds,sizes] of [[w,addresses.ca,18,['0.01','0.1','1','5','50']],[addresses.ca,w,18,['0.01','1','100','1000']],[addresses.usdt,w,6,['1','5']],[w,addresses.usdt,18,['0.1','1']]] as [Address,Address,number,string[]][]){
    const decimals=await read(from,'decimals');if(typeof decimals!=='number')continue;
    for(const s of sizes){const [l,r='']=s.split('.');const amount=BigInt(l??'0')*10n**BigInt(decimals)+BigInt(r.padEnd(decimals,'0'));const result=await read(router,'getAmountsOut',[amount,[from,to]]);venue.quotes.push({from,to,input:s,inputDecimals:decimals,amount,result});}
   }
 }
}
writeFileSync('docs/security/caswap-correction/live.json',JSON.stringify(out,(_k,v)=>typeof v==='bigint'?v.toString():v,2));
console.log(JSON.stringify({pin:out.pin,registries:{v3:out.contracts.v3.registry,v4:out.contracts.v4.registry},venues:out.venues},(_k,v)=>typeof v==='bigint'?v.toString():v,2));
