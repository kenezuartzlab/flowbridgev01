/** Offline/admin diagnostic only. Never imported by the application or used to authorize transactions. */
import { BNB_ASSETS } from '../../../src/lib/bnb/quoteAdapter';
import { POOL_GATE } from '../../../src/lib/rwa/quoteReadiness';
export interface TierObservation {
  chainId: number; tokenIn: string; tokenOut: string; router: string; tier: 500 | 2500;
  amountIn: string; grossOutput: string; wholeSwapGas: string | null;
  gasPriceWei: string; outputPerBnb: string; quotedAtSeconds: number; blockNumber: number;
  blockHash: string; factoryVerified: boolean; source: 'LOCAL_FORK_SIMULATION';
}
export interface PreviewContext { chainId: number; tokenIn: string; tokenOut: string; amountIn: string; blockNumber: number; blockHash: string; nowSeconds: number; proposalFeeBps: 0 | 5 | 10; paused: boolean; }
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
const uint=(v:unknown):bigint|null=>typeof v==='string'&&/^(0|[1-9]\d{0,77})$/.test(v)?BigInt(v):null;
export function previewTierChoice(rows: readonly TierObservation[], c: PreviewContext) {
 const hold=(status:string)=>({status,executable:false,proposalOnly:true,approved:false,selectedTier:null} as const);
 const W=BNB_ASSETS.WBNB.address,U=BNB_ASSETS.USDT.address;
 if(c.chainId!==56||c.paused||![0,5,10].includes(c.proposalFeeBps)||!Number.isSafeInteger(c.nowSeconds)||!Number.isSafeInteger(c.blockNumber))return hold('BLOCKED');
 if(!((same(c.tokenIn,W)&&same(c.tokenOut,U))||(same(c.tokenIn,U)&&same(c.tokenOut,W))))return hold('BLOCKED');
 const input=uint(c.amountIn);if(input===null||input<=0n||input>(same(c.tokenIn,W)?10n**18n:1000n*10n**18n))return hold('BLOCKED');
 if(rows.length!==2||new Set(rows.map(r=>r.tier)).size!==2||!rows.every(r=>r.tier===500||r.tier===2500))return hold('POOL_UNVERIFIED');
 const costs=[];
 for(const r of rows){
  if(r.chainId!==56||!same(r.tokenIn,c.tokenIn)||!same(r.tokenOut,c.tokenOut)||!same(r.router,POOL_GATE.router)||r.amountIn!==c.amountIn||!r.factoryVerified||r.source!=='LOCAL_FORK_SIMULATION')return hold('CONTEXT_MISMATCH');
  if(!Number.isSafeInteger(r.quotedAtSeconds)||!Number.isSafeInteger(r.blockNumber)||c.nowSeconds<r.quotedAtSeconds||c.nowSeconds-r.quotedAtSeconds>30||r.blockNumber!==c.blockNumber||!/^0x[\da-fA-F]{64}$/.test(r.blockHash)||!same(r.blockHash,c.blockHash))return hold('STALE_OR_REORG');
  const gross=uint(r.grossOutput),gas=uint(r.wholeSwapGas),price=uint(r.gasPriceWei),rate=uint(r.outputPerBnb);
  if(gross===null||gross<=0n||gas===null||gas<=0n||price===null||rate===null||rate<=0n)return hold('GAS_OR_OUTPUT_UNKNOWN');
  const fee=gross*BigInt(c.proposalFeeBps)/10000n;const gasCost=gas*price*rate/10n**18n;const net=gross-fee-gasCost;
  if(net<=0n)return hold('UNECONOMIC');
  costs.push({tier:r.tier,grossOutput:gross.toString(),proposalFeeOutput:fee.toString(),simulatedGasOutput:gasCost.toString(),netAfterFeeAndGas:net.toString()});
 }
 const first=costs[0],second=costs[1];if(!first||!second)return hold('POOL_UNVERIFIED');
 const a=BigInt(first.netAfterFeeAndGas),b=BigInt(second.netAfterFeeAndGas);
 return {status:a===b?'TIE':'SIMULATION_PREVIEW_ONLY',executable:false,proposalOnly:true,approved:false,selectedTier:a===b?null:a>b?first.tier:second.tier,costs,gasEvidence:'LOCAL_FORK_SIMULATION_NOT_LIVE_GUARANTEE',feeApproved:false} as const;
}
/** Local draft context is disposable; even a reviewed diagnostic never grants approval/allowance state. */
export class PreviewDraft {
 private chain=56;
 quote: ReturnType<typeof previewTierChoice>|null=null;
 review: null=null;
 allowance: null=null;
 setChain(chain:number){if(chain!==this.chain){this.quote=null;this.review=null;this.allowance=null;}this.chain=chain;}
 setQuote(q:ReturnType<typeof previewTierChoice>){this.quote=this.chain===56?q:null;}
}
