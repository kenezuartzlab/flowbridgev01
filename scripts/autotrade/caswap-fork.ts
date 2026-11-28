// All effects are on a disposable localhost fork. No private key or signing transport.
import {createPublicClient,http,parseAbi,encodeFunctionData,parseUnits,keccak256,formatUnits,type Address,type Hex} from 'viem';
import {readFileSync,writeFileSync} from 'node:fs';
import {assertAuditTransport,exactRegistryPreview} from './caswap-audit-policy';
const URL='http://127.0.0.1:8547';const pc=createPublicClient({transport:http(URL,{timeout:30000,retryCount:0})});
const evidence=JSON.parse(readFileSync('docs/security/caswap-correction/live.json','utf8'));const A=evidence.addresses;
const trader='0x1000000000000000000000000000000000000001' as Address;
const abi=parseAbi(['function owner() view returns(address)','function feeTreasury() view returns(address)','function routerCount() view returns(uint256)','function routers(uint256) view returns(address,uint8,address,bool,string,string)','function computeRouterFee(uint256,uint256,address) view returns(uint256,uint256)','function registerRouter(address,uint8,address,string,string) returns(uint256)','function setRouterActive(uint256,bool)','function integrationActivationDelay() view returns(uint256)','function routerActivationTime(uint256) view returns(uint256)','function swapNativeToTokenSafe(uint256,uint256,address,uint24,uint256,address[],address,uint256,uint256) payable returns(uint256)','function swapTokenToNativeSafe(uint256,address,uint24,uint256,uint256,address[],address,uint256,uint256) returns(uint256)','function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function approve(address,uint256) returns(bool)','function totalSupply() view returns(uint256)','function pairFeeBps(address,address) view returns(uint256)','function isFeeExempt(address) view returns(bool)','function getAmountsOutForUser(uint256,address[],address) view returns(uint256[])','function getAmountsOut(uint256,address[]) view returns(uint256[])','function deposit() payable','function withdraw(uint256)','function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns(uint256,uint160,uint32,uint256)']);
const out:any={kind:'LOCAL_PINNED_FORK_ONLY',mainnetWrites:0,signatures:0,syntheticLocalTrader:trader,sourcePin:evidence.pin,steps:[],errors:[]};
const read=(address:Address,fn:string,args:any[]=[])=>pc.readContract({address,abi,functionName:fn as any,args:args as any});
const rpc=async(method:string,params:any[]=[])=>{assertAuditTransport(URL,method);return pc.request({method:method as any,params:params as any})};
const data=(fn:string,args:any[]=[])=>encodeFunctionData({abi,functionName:fn as any,args:args as any});
async function send(to:Address,fn:string,args:any[]=[],value=0n,from=trader){const hash=await rpc('eth_sendTransaction',[{from,to,data:data(fn,args),value:'0x'+value.toString(16),gas:'0x1e8480'}]) as Hex;const r=await pc.waitForTransactionReceipt({hash});if(r.status!=='success')throw Error(`${fn} MINED_REVERTED`);return r;}
const bal=(token:Address,who:Address)=>read(token,'balanceOf',[who]) as Promise<bigint>;
const deadline=async()=> (await pc.getBlock()).timestamp+300n;
const log=(name:string,fields:any)=>out.steps.push({name,...fields});
const error=(e:any)=>String(e.shortMessage??e.message).slice(0,700);
async function snapshot(){const x:any={native:await pc.getBalance({address:A.v4})};for(const t of [A.ca,A.caWbot,A.wbot,A.usdt])x[t]=await bal(t,A.v4);return x;}
const changes=(x:any,y:any)=>Object.keys(x).filter(k=>x[k]!==y[k]);
async function attempt(name:string,to:Address,fn:string,args:any[],value=0n){try{const r=await pc.call({account:trader,to,data:data(fn,args),value});log(name,{reverted:false,data:r.data});}catch(e){log(name,{reverted:true,error:error(e)});}}
async function main(){
 const b=await pc.getBlock();out.fork={number:b.number,hash:b.hash,chainId:await pc.getChainId()};if(String(b.number)!==evidence.pin.number||b.hash!==evidence.pin.hash||out.fork.chainId!==677)throw Error('FORK_PIN_MISMATCH');
 const owner=await read(A.v4,'owner') as Address;
 for(const who of [trader,owner]){await rpc('anvil_impersonateAccount',[who]);await rpc('anvil_setBalance',[who,'0x'+(10n**23n).toString(16)]);}
 const wrap=A.caWbot as Address;
 const backing=await pc.getBalance({address:wrap}),supply=await read(wrap,'totalSupply');const wb=await bal(wrap,trader),native=await pc.getBalance({address:trader});
 await send(wrap,'deposit',[],parseUnits('0.01',18));const deposited=await bal(wrap,trader)-wb;
 const rc=await send(wrap,'withdraw',[deposited]);const nativeAfter=await pc.getBalance({address:trader});log('wrapper backing and deposit/withdraw',{backing,supply,backingAtLeastSupply:backing>=BigInt(String(supply)),depositDelta:deposited,wrappedResidual:await bal(wrap,trader)-wb,withdrawReceipt:rc.status,nativeAfter,initialNative:native});
 const id=await read(A.v4,'routerCount') as bigint,preview=exactRegistryPreview(A.supplied,wrap);out.proposedRegistry=preview;
 await attempt('unauthorized registration',A.v4,'registerRouter',[A.supplied,0,wrap,preview.name,preview.version]);
 const reg=await send(A.v4,'registerRouter',[A.supplied,0,wrap,preview.name,preview.version],0n,owner);
 log('local-only registration',{id,status:reg.status,entry:await read(A.v4,'routers',[id]),activationDelay:await read(A.v4,'integrationActivationDelay').catch(()=> 'UNKNOWN')});
 const factory=evidence.venues.supplied.factory as Address;
 out.directionalFees={buy:await read(factory,'pairFeeBps',[wrap,A.ca]),sell:await read(factory,'pairFeeBps',[A.ca,wrap]),v4Exempt:await read(factory,'isFeeExempt',[A.v4]),v3Exempt:await read(factory,'isFeeExempt',[A.v3])};
 const treasury=await read(A.v4,'feeTreasury') as Address;
 for(const s of ['0.01','0.1','1','5']){
  const amount=parseUnits(s,18),[fee,bps]=await read(A.v4,'computeRouterFee',[id,amount,trader]) as [bigint,bigint];
  const q=await read(A.supplied,'getAmountsOutForUser',[amount,[wrap,A.ca],A.v4]) as bigint[];const quoted=q[1];if(quoted===undefined)throw Error('BAD_QUOTE');
  const min=quoted*99n/100n,base=await bal(A.ca,trader),r0=await snapshot(),t0=await pc.getBalance({address:treasury});
  await attempt(`buy excessive floor ${s}`,A.v4,'swapNativeToTokenSafe',[id,amount,A.ca,0,quoted+1n,[wrap,A.ca],trader,await deadline(),fee],amount+fee);
  await attempt(`buy wrong wrapper ${s}`,A.v4,'swapNativeToTokenSafe',[id,amount,A.ca,0,min,[A.wbot,A.ca],trader,await deadline(),fee],amount+fee);
  const buy=await send(A.v4,'swapNativeToTokenSafe',[id,amount,A.ca,0,min,[wrap,A.ca],trader,await deadline(),fee],amount+fee);
  const got=await bal(A.ca,trader)-base,r1=await snapshot(),td=await pc.getBalance({address:treasury})-t0;
  log(`buy ${s} BOT`,{amount,fee,bps,quoted,min,actualOut:got,outAtLeastMin:got>=min,feeOnce:td===fee,routerResidualChanges:changes(r0,r1),gas:buy.gasUsed});
  // Spend exactly acquired CA INCLUDING the V4 input-side fee. No synthetic token balance injection.
  let sellAmount=got*10000n/(10000n+bps);let sf=(await read(A.v4,'computeRouterFee',[id,sellAmount,trader]) as [bigint,bigint])[0];
  if(sellAmount+sf>got)throw Error('SELL_BUDGET_OVERFLOW');
  const sq=await read(A.supplied,'getAmountsOutForUser',[sellAmount,[A.ca,wrap],A.v4]) as bigint[];const sqOut=sq[1];if(sqOut===undefined)throw Error('BAD_SELL_QUOTE');
  const sm=sqOut*99n/100n;
  await send(A.ca,'approve',[A.v4,sellAmount+sf]);
  await attempt(`sell excessive floor ${s}`,A.v4,'swapTokenToNativeSafe',[id,A.ca,0,sellAmount,sqOut+1n,[A.ca,wrap],trader,await deadline(),sf]);
  const sn=await pc.getBalance({address:trader}),st=await bal(A.ca,treasury),sb=await snapshot();
  const sell=await send(A.v4,'swapTokenToNativeSafe',[id,A.ca,0,sellAmount,sm,[A.ca,wrap],trader,await deadline(),sf]);
  const actualNative=await pc.getBalance({address:trader})-sn+sell.gasUsed*sell.effectiveGasPrice;
  const allowance=await read(A.ca,'allowance',[trader,A.v4]),routerAllowance=await read(A.ca,'allowance',[A.v4,A.supplied]);
  log(`sell acquired CA ${s}`,{sellAmount,fee:sf,quoted:sqOut,min:sm,actualNative,outAtLeastMin:actualNative>=sm,feeOnce:await bal(A.ca,treasury)-st===sf,userAllowance:allowance,routerAllowance,caDust:await bal(A.ca,trader)-base,routerResidualChanges:changes(sb,await snapshot()),gas:sell.gasUsed});
  if(allowance!==0n||routerAllowance!==0n||actualNative<sm||got<min||changes(r0,r1).length||changes(sb,await snapshot()).length)throw Error('ACCOUNTING_ASSERTION_FAILED');
 }
 for(const amount of [parseUnits('0.1',18),parseUnits('1',18),parseUnits('5',18)]){
  const start=await rpc('evm_snapshot');
  for(const [from,to] of [[A.wbot,A.ca],[A.ca,A.wbot]]){
   try{const r=await pc.simulateContract({address:A.quoter,abi,functionName:'quoteExactInputSingle',args:[{tokenIn:from,tokenOut:to,amountIn:amount,fee:10000,sqrtPriceLimitX96:0n}]});log('BDEX V3 quote',{from,to,amount,quoted:r.result[0],feePool:10000});}catch(e){log('BDEX V3 quote',{from,to,amount,UNKNOWN:error(e)});}
  }await rpc('evm_revert',[start]);
 }
 await attempt('unsupported atomic CA/USDT path',A.v4,'swapNativeToTokenSafe',[id,parseUnits('0.1',18),A.usdt,0,1n,[wrap,A.usdt],trader,await deadline(),10n**14n],parseUnits('0.1001',18));
 await attempt('unknown registry ID',A.v4,'swapNativeToTokenSafe',[99n,parseUnits('0.1',18),A.ca,0,1n,[wrap,A.ca],trader,await deadline(),0n],parseUnits('0.1',18));
 out.result='LOCAL_REHEARSAL_COMPLETE';
}
try{await main();}catch(e){out.errors.push(error(e));out.result='INCOMPLETE';process.exitCode=1;}finally{writeFileSync('docs/security/caswap-correction/fork.json',JSON.stringify(out,(_k,v)=>typeof v==='bigint'?v.toString():v,2));console.log(JSON.stringify(out,(_k,v)=>typeof v==='bigint'?v.toString():v,2));}
