import { createPublicClient, http, parseAbi, type Hex } from 'viem';
import { MAINNET_PAYOUT_AUDIT } from './rewardFundingPlan';
import { vaultFlowToken } from './vaultV2';
import type { StoredBatch } from './settlementPlanner';
import { merkleClaimLeafHash, verifyMerkleProof } from './merkleClaim';
import { integerWei } from './immutableBatch';
type DB = Awaited<typeof import('@/integrations/supabase/client.server')>['supabaseAdmin'];
const abi = parseAbi(['function epochCount() view returns(uint256)','function token() view returns(address)','function getEpoch(uint256) view returns((bytes32 root,uint256 allocation,uint256 claimed,uint64 claimStart,uint64 claimEnd,bool cancelled,bool released))']);

/** SELECT + eth_call only. Every chain round needs exact reproducible local leaves before carryover. */
export async function verifyCarryoverV1(db: DB) {
  const rpc=createPublicClient({transport:http('https://rpc.botchain.ai',{timeout:15000,retryCount:1})});
  if(await rpc.getChainId()!==677)throw new Error('WRONG_CHAIN');
  const block=await rpc.getBlock();
  const distributor=MAINNET_PAYOUT_AUDIT.address as Hex;
  const at={address:distributor,abi,blockNumber:block.number};
  const [count,token]=await Promise.all([rpc.readContract({...at,functionName:'epochCount'}),rpc.readContract({...at,functionName:'token'})]);
  if(token.toLowerCase()!==vaultFlowToken()?.toLowerCase()||count>1000n)throw new Error('V1_IDENTITY_OR_SCAN_BOUND');
  const r=await db.from('reward_settlement_batches').select('epoch_id,root,total_wei,claim_start,claim_end,leaves').eq('chain_id',677).eq('distributor',MAINNET_PAYOUT_AUDIT.address.toLowerCase()).order('epoch_id').limit(1001);
  if(r.error||!r.data||r.data.length>1000)throw new Error('FULL_V1_HISTORY_REQUIRED');
  const epochs=[];
  for(let id=1;id<=Number(count);id++){
    const onchain=await rpc.readContract({...at,functionName:'getEpoch',args:[BigInt(id)]});
    const matches=r.data.filter(x=>x.epoch_id===id);
    const canonical=matches.filter(x=>x.root.toLowerCase()===onchain.root.toLowerCase());
    const row=canonical[0];
    if(!row||canonical.length!==1)throw new Error('V1_ROUND_MISSING_OR_CONFLICTING');
    const b:StoredBatch={epochId:id,root:row.root as Hex,totalWei:integerWei(row.total_wei).toString(),claimStart:Number(row.claim_start),claimEnd:Number(row.claim_end),leaves:row.leaves as unknown as StoredBatch['leaves']};
    // Schedule renewals do not change a round's economic commitment; chain root/allocation are authoritative.
    if(BigInt(b.totalWei)!==onchain.allocation||!b.leaves.length||b.leaves.reduce((n,l)=>n+BigInt(l.amount),0n)!==onchain.allocation
      ||!b.leaves.every(l=>verifyMerkleProof({leaf:merkleClaimLeafHash({chainId:677,distributor,leaf:{epochId:id,index:l.index,account:l.account,amount:l.amount}}),proof:l.proof,root:b.root})))throw new Error('V1_ROOT_PROOF_OR_AMOUNT_MISMATCH');
    // Whole FLOW ledger carryover cannot represent fractions; reject instead of rounding commitments.
    if(b.leaves.some(l=>BigInt(l.amount)%10n**18n!==0n))throw new Error('FRACTIONAL_V1_COMMITMENT');
    epochs.push({id,root:onchain.root,allocation:onchain.allocation.toString()});
  }
  if((await rpc.getBlock({blockNumber:block.number})).hash!==block.hash)throw new Error('V1_CHAIN_REORGANIZED');
  return {chainId:677,blockNumber:block.number.toString(),blockHash:block.hash,epochCount:Number(count),epochs};
}