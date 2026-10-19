import { createFileRoute } from '@tanstack/react-router';

/** Admin session + bound wallet context. No client address can authorize a chain sender. */
async function handle(request:Request) {
 const {requireAdmin}=await import('@/lib/admin/adminGate.server');
 const {jsonResponse}=await import('@/lib/api-auth.server');
 const gate=await requireAdmin(request);
 if(!gate.ok) return gate.response;
 const {supabaseAdmin:admin}=await import('@/integrations/supabase/client.server');
 const {SETTLEMENT_SIGNER}=await import('@/lib/rewards/settlementPlanner');
 const {DISTRIBUTOR}=await import('@/lib/rewards/settlement.server');
 if(request.method==='GET') {
  const [history,attempts]=await Promise.all([
   admin.from('admin_audit_events').select('object_id,action,new_value,created_at').eq('object_type','reward_round').order('created_at',{ascending:false}).limit(20),
   admin.from('reward_publish_attempts').select('id,epoch_id,root,fingerprint,tx_hash,phase').eq('operator_id',gate.admin.userId).order('created_at',{ascending:false}).limit(20),
  ]);
  if(history.error || attempts.error) return jsonResponse({error:'Publication recovery unavailable'},503);
  return jsonResponse({history:history.data,attempts:attempts.data});
 }
 if(gate.admin.wallet.toLowerCase()!==SETTLEMENT_SIGNER.address.toLowerCase()) return jsonResponse({error:'Authorized publisher account required'},403);
 const body=await request.json().catch(()=>null);
 if(!body || !Number.isInteger(body.epochId) || body.epochId<=2 || !/^0x[0-9a-f]{64}$/i.test(body.root ?? '') || typeof body.fingerprint!=='string') return jsonResponse({error:'Invalid reviewed batch'},400);
 try {
  const {data:batch,error}=await admin.from('reward_settlement_batches').select('*').eq('chain_id',677).eq('distributor',DISTRIBUTOR.toLowerCase()).eq('epoch_id',body.epochId).eq('root',body.root.toLowerCase()).eq('fingerprint',body.fingerprint).maybeSingle();
  if(error) throw error;
  if(!batch || !Array.isArray(batch.leaves) || !batch.leaves.length) return jsonResponse({error:'Reviewed batch not found'},404);
  if(request.method==='PUT') {
   const {buildRewardSolvencyReport}=await import('@/lib/rewards/rewardSolvency.server');
   const fresh=(await buildRewardSolvencyReport()).settlement;
   if(fresh.status!=='READY_FOR_PUBLISHER_REVIEW' || fresh.fingerprint!==batch.fingerprint || fresh.root!==batch.root || !fresh.tx || !fresh.simulation?.ok) return jsonResponse({error:'Batch is stale or blocked; rebuild before review'},409);
   // The unique chain/distributor/epoch lock never expires automatically: uncertainty must never permit a resend.
   const {data:attempt,error:lockError}=await admin.from('reward_publish_attempts').insert({batch_id:batch.id,chain_id:677,distributor:DISTRIBUTOR.toLowerCase(),epoch_id:batch.epoch_id,root:batch.root,fingerprint:batch.fingerprint,operator_id:gate.admin.userId}).select('id').single();
   if(lockError || !attempt) return jsonResponse({error:'This epoch already has a publication attempt. Recover it; do not send again.'},409);
   return jsonResponse({attemptId:attempt.id});
  }
  if(typeof body.attemptId!=='string' || !/^0x[0-9a-f]{64}$/i.test(body.txHash ?? '')) return jsonResponse({error:'Original attempt and transaction hash required'},400);
  const {data:attempt,error:attemptError}=await admin.from('reward_publish_attempts').select('*').eq('id',body.attemptId).eq('batch_id',batch.id).eq('operator_id',gate.admin.userId).maybeSingle();
  if(attemptError) throw attemptError;
  if(!attempt || (attempt.tx_hash && attempt.tx_hash!==body.txHash.toLowerCase())) return jsonResponse({error:'Original publication attempt mismatch'},409);
  if(!attempt.tx_hash) {
   const {data:attached,error:attachError}=await admin.from('reward_publish_attempts').update({tx_hash:body.txHash.toLowerCase(),phase:'BROADCAST_PENDING'}).eq('id',attempt.id).is('tx_hash',null).select('id');
   if(attachError || !attached?.length) return jsonResponse({error:'Concurrent transaction attachment; reload recovery'},409);
  }
  const {verifyPublicationOnChain}=await import('@/lib/rewards/publicationRecovery.server');
  const result=await verifyPublicationOnChain({epochId:batch.epoch_id,root:batch.root as `0x${string}`,totalWei:BigInt(String(batch.total_wei).split('.')[0]).toString(),claimStart:Number(batch.claim_start),claimEnd:Number(batch.claim_end),leaves:batch.leaves as never},body.txHash,gate.admin.wallet);
  if(result.phase==='CONFIRMED_VERIFIED' && result.blockHash && result.blockNumber) {
   const {error:saveError}=await admin.rpc('confirm_reward_publication',{p_attempt:attempt.id,p_hash:body.txHash,p_block_hash:result.blockHash,p_block: Number(result.blockNumber),p_actor:gate.admin.userId,p_email:gate.admin.email,p_role:gate.admin.role});
   if(saveError) throw saveError;
  } else {
   const {error:saveError}=await admin.from('reward_publish_attempts').update({phase:result.phase,updated_at:new Date().toISOString()}).eq('id',attempt.id);
   if(saveError) throw saveError;
  }
  return jsonResponse(result);
 } catch {
  return jsonResponse({error:'Verification unavailable. Keep the original transaction; re-check only.'},503);
 }
}
export const Route=createFileRoute('/api/admin/rewards-publish-verify')({server:{handlers:{GET:({request})=>handle(request),PUT:({request})=>handle(request),POST:({request})=>handle(request)}});
