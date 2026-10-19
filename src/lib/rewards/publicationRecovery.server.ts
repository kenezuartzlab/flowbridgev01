/** All chain access is read-only. Exact receipt, event, calldata and canonical block required. */
import { createPublicClient,http,parseAbi,type Hex } from 'viem';
import { verifyPublicationIdentity } from './publicationVerification';
import { DISTRIBUTOR_ROLES,verifyPublishedRound,type StoredBatch } from './settlementPlanner';
import { DISTRIBUTOR,readChainState,readEpoch } from './settlement.server';
export async function verifyPublicationOnChain(batch:StoredBatch,hash:Hex,operatorWallet:string) {
 const c=createPublicClient({transport:http('https://rpc.botchain.ai',{timeout:15000,retryCount:0})});
 const chainId=await c.getChainId();
 if(chainId!==677) throw new Error('WRONG_RPC_CHAIN');
 // Only not-found means pending; transport failures remain unavailable, never terminal/retry-send.
 const missing=(e:unknown)=> ['TransactionNotFoundError','TransactionReceiptNotFoundError'].includes((e as Error).name);
 const [tx,receipt]=await Promise.all([
  c.getTransaction({hash}).catch(e=>{if(missing(e)) return null; throw e;}),
  c.getTransactionReceipt({hash}).catch(e=>{if(missing(e)) return null; throw e;}),
 ]);
 if(!tx || !receipt) return {phase:'BROADCAST_PENDING' as const,checks:[]};
 const [block,head,role]=await Promise.all([
  c.getBlock({blockNumber:receipt.blockNumber}),c.getBlockNumber(),
  c.readContract({address:DISTRIBUTOR,abi:parseAbi(['function hasRole(bytes32,address) view returns(bool)']),functionName:'hasRole',args:[DISTRIBUTOR_ROLES.PUBLISHER_ROLE,tx.from],blockNumber:receipt.blockNumber}),
 ]);
 if(block.hash!==receipt.blockHash || head<receipt.blockNumber+1n) return {phase:'BROADCAST_PENDING' as const,checks:[{id:'CANONICAL_CONFIRMATIONS',pass:false}]};
 const identity=verifyPublicationIdentity({chainId,operatorWallet,publisherRole:role,tx,receipt,canonicalBlockHash:block.hash,head,distributor:DISTRIBUTOR,batch});
 if(receipt.status==='reverted') return {phase:'REVERTED' as const,checks:identity.checks};
 if(!identity.complete) return {phase:'CONFIRMED_MISMATCH' as const,checks:identity.checks};
 const [live,epoch]=await Promise.all([readChainState(),readEpoch(batch.epochId)]);
 if(!live || !epoch) throw new Error('CHAIN_STATE_UNAVAILABLE');
 const verified=verifyPublishedRound({batch,receiptStatus:receipt.status,liveEpochCount:live.epochCount,epoch,paused:live.paused,balanceWei:live.balanceWei,totalReservedWei:live.totalReservedWei,chainId,distributor:DISTRIBUTOR});
 return {phase:verified.complete?'CONFIRMED_VERIFIED' as const:'CONFIRMED_MISMATCH' as const,checks:[...identity.checks,...verified.checks],blockHash:receipt.blockHash,blockNumber:receipt.blockNumber.toString()};
}
