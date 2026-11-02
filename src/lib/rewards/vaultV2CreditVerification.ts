import { decodeEventLog, decodeFunctionData, type Address, type Hex } from 'viem';
import { VAULT_V2_ABI } from './vaultV2Abi.generated';

/** Authoritative receipt/calldata match; never accepts a hash as a credit. */
export function verifyVaultCredit(input: {
  chainId:number;contract:Address;publisher:Address;batchId:Hex;wallets:Address[];amounts:bigint[];
  tx:{from:string;to:string|null;input:Hex};
  receipt:{status:'success'|'reverted';to:string|null;blockHash:Hex;blockNumber:bigint;logs:{address:string;data:Hex;topics:readonly Hex[]}[]};
  canonicalBlockHash:Hex;head:bigint;processed:boolean;
}) {
  if(input.chainId!==677 || input.receipt.status!=='success' || input.head-input.receipt.blockNumber<2n || input.canonicalBlockHash!==input.receipt.blockHash || !input.processed) return false;
  if(input.tx.from.toLowerCase()!==input.publisher.toLowerCase() || input.tx.to?.toLowerCase()!==input.contract.toLowerCase() || input.receipt.to?.toLowerCase()!==input.contract.toLowerCase())return false;
  try {
    const call=decodeFunctionData({abi:VAULT_V2_ABI,data:input.tx.input});
    if(call.functionName!=='creditBatch')return false;
    const [batchId,wallets,amounts]=call.args;
    if(batchId!==input.batchId || wallets.length!==input.wallets.length || amounts.length!==input.amounts.length || wallets.some((w,i)=>w.toLowerCase()!==input.wallets[i]?.toLowerCase()) || amounts.some((a,i)=>a!==input.amounts[i]))return false;
    const events=input.receipt.logs.filter(l=>l.address.toLowerCase()===input.contract.toLowerCase()).map(l=>{try{return decodeEventLog({abi:VAULT_V2_ABI,data:l.data,topics:l.topics as [Hex,...Hex[]]})}catch{return null}});
    const batch=events.filter(e=>e?.eventName==='BatchCredited');
    if(batch.length!==1 || batch[0]?.eventName!=='BatchCredited')return false;
    if(batch[0].args.batchId!==input.batchId || batch[0].args.total!==input.amounts.reduce((a,b)=>a+b,0n) || batch[0].args.recipients!==BigInt(input.wallets.length))return false;
    const credited=events.filter(e=>e?.eventName==='WalletCredited');
    return credited.length===input.wallets.length && credited.every((e,i)=>e?.eventName==='WalletCredited' && e.args.batchId===input.batchId && e.args.wallet.toLowerCase()===input.wallets[i]?.toLowerCase() && e.args.amount===input.amounts[i]);
  } catch{return false;}
}