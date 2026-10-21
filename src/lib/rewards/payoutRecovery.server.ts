import type { Hex } from 'viem';
import { integerWei } from './immutableBatch';
import { resolveBatchSchedule } from './scheduleRenewal.server';
import { publicationClient, publicationNonceMatches, recoverPublisherHash } from './publisherReconciliation.server';
import { verifyPublicationOnChain } from './publicationRecovery.server';
import { SETTLEMENT_SIGNER } from './settlementPlanner';
type Admin=Awaited<typeof import('@/integrations/supabase/client.server')>['supabaseAdmin'];

/** Reconcile only: never cancel, unlock uncertain attempts, sign or send. */
export async function reconcileDurablePublications(admin:Admin){
 const {data:attempts,error}=await admin.from('reward_publish_attempts').select('*').eq('chain_id',677).eq('retry_safe',false).neq('phase','CONFIRMED_VERIFIED').limit(20);
 if(error)throw new Error('Publication recovery unavailable');
 let confirmed=0,unresolved=0;
 for(const a of attempts??[]){
  try{
   const {data:original,error:batchError}=await admin.from('reward_settlement_batches').select('*').eq('id',a.batch_id).single();
   if(batchError || !original)throw new Error('Stored batch missing');
   const b=await resolveBatchSchedule(admin,original);
   if(b.root!==a.root || b.fingerprint!==a.fingerprint || a.sender?.toLowerCase()!==SETTLEMENT_SIGNER.address.toLowerCase())throw new Error('Identity changed');
   const hash=(a.tx_hash??await recoverPublisherHash(a,await publicationClient().getBlockNumber())) as Hex|null;
   if(!hash || !await publicationNonceMatches(hash,a.sender_nonce)){unresolved++;continue;}
   const result=await verifyPublicationOnChain({epochId:b.epoch_id,root:b.root as Hex,totalWei:integerWei(b.total_wei),claimStart:Number(b.claim_start),claimEnd:Number(b.claim_end),leaves:b.leaves as never},hash,SETTLEMENT_SIGNER.address);
   if(result.phase!=='CONFIRMED_VERIFIED' || !result.blockHash || !result.blockNumber){unresolved++;continue;}
   const transition=await admin.rpc('transition_reward_publication',{p_attempt:a.id,p_operation:a.operation_id,p_actor:a.operator_id,p_phase:'CONFIRMING',p_hash:hash,p_retry_safe:false});
   if(transition.error)throw transition.error;
   const saved=await admin.rpc('confirm_reward_publication',{p_attempt:a.id,p_hash:hash,p_block_hash:result.blockHash,p_block:Number(result.blockNumber),p_actor:a.operator_id,p_email:'',p_role:'internal_operator'});
   if(saved.error)throw saved.error;
   confirmed++;
  }catch{unresolved++;}
 }
 return {confirmed,unresolved};
}