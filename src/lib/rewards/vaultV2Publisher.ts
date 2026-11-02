import { encodeFunctionData, type Address, type Hex } from 'viem';
import { VAULT_V2_ABI } from './vaultV2Abi.generated';
export type PublisherBatch = {batch_id:string; snapshot_hash:string; contract_address:string; publisher:string; source_ids:string[]; wallets:string[]; amounts_wei:string[]; total_wei:string|number; state:string};
export type PublisherIntent = {operation_id:string;batch_id:string;publisher:string;nonce:number;start_block:number;calldata:Hex;phase:string;tx_hash:Hex|null};
export function publisherCalldata(b:PublisherBatch):Hex {
  if(b.wallets.length<1||b.wallets.length>100||b.wallets.length!==b.amounts_wei.length||new Set(b.wallets.map(w=>w.toLowerCase())).size!==b.wallets.length||new Set(b.source_ids).size!==b.source_ids.length||!b.source_ids.length)throw new Error('Immutable batch malformed.');
  const amounts=b.amounts_wei.map(BigInt);
  if(amounts.some(a=>a<=0n)||amounts.reduce((a,b)=>a+b,0n)!==BigInt(b.total_wei))throw new Error('Immutable amount mismatch.');
  return encodeFunctionData({abi:VAULT_V2_ABI,functionName:'creditBatch',args:[b.batch_id as Hex,b.wallets as Address[],amounts]});
}
export function publisherIdentity(wallet:string,accounts:string[],chain:unknown,publisher:string) {
  if(Number(chain)!==677)throw new Error('Switch to BOT Mainnet 677.');
  if(wallet.toLowerCase()!==publisher.toLowerCase()||accounts[0]?.toLowerCase()!==wallet.toLowerCase())throw new Error('Connect the exact bound on-chain publisher wallet.');
}
export function matchesPublisherTransaction(tx:{from:string;to:string|null;input:string;value:bigint;nonce:number},intent:PublisherIntent,b:PublisherBatch) {
  return tx.from.toLowerCase()===intent.publisher.toLowerCase()&&tx.to?.toLowerCase()===b.contract_address.toLowerCase()&&tx.input.toLowerCase()===publisherCalldata(b).toLowerCase()&&tx.input.toLowerCase()===intent.calldata.toLowerCase()&&tx.value===0n&&tx.nonce===Number(intent.nonce);
}
export type PublisherPort = {
  identity:()=>Promise<void>; acquire:()=>Promise<PublisherIntent>; persist:(intent:PublisherIntent)=>void;
  send:(intent:PublisherIntent)=>Promise<Hex>; attach:(intent:PublisherIntent,hash:Hex)=>Promise<void>;
  rejected:(intent:PublisherIntent)=>Promise<void>; resume:(intent:PublisherIntent)=>Promise<unknown>;
};
/** Only a freshly acquired DB operation can reach a send. Resume NEVER sends. */
export async function signVaultBatch(b:PublisherBatch,port:PublisherPort) {
  publisherCalldata(b);await port.identity();
  const intent=await port.acquire();
  if(intent.batch_id!==b.batch_id||intent.phase!=='SIGNATURE'||intent.tx_hash||intent.calldata!==publisherCalldata(b)||intent.publisher.toLowerCase()!==b.publisher.toLowerCase())throw new Error('Signing intent mismatch. Resume verification.');
  port.persist(intent); // durable backend acquisition and local journal both precede popup
  try {await port.identity();}catch(e){throw e;} // no automatic cancellation for wallet switch
  let hash:Hex;
  try {hash=await port.send(intent);}catch(e){
    if(typeof e==='object'&&e!==null&&'code' in e&&e.code===4001)await port.rejected(intent);
    throw e;
  }
  intent.tx_hash=hash;intent.phase='SUBMITTED';port.persist(intent); // before any network wait
  await port.attach(intent,hash);
  return port.resume(intent);
}
