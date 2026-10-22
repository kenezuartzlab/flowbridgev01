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
   admin.from('reward_publish_attempts').select('id,operation_id,epoch_id,root,fingerprint,tx_hash,phase,retry_safe').eq('operator_id',gate.admin.userId).order('created_at',{ascending:false}).limit(20),
  ]);
  if(history.error || attempts.error) return jsonResponse({error:'Publication recovery unavailable'},503);
  return jsonResponse({history:history.data,attempts:attempts.data});
 }
 if(gate.admin.wallet.toLowerCase()!==SETTLEMENT_SIGNER.address.toLowerCase()) return jsonResponse({error:'Authorized publisher account required'},403);
 const body=await request.json().catch(()=>null);
 if(!body || !Number.isInteger(body.epochId) || body.epochId<=2 || !/^0x[0-9a-f]{64}$/i.test(body.root ?? '') || typeof body.fingerprint!=='string') return jsonResponse({error:'Invalid reviewed batch'},400);
 try {
  const {data:original,error}=await admin.from('reward_settlement_batches').select('*').eq('chain_id',677).eq('distributor',DISTRIBUTOR.toLowerCase()).eq('epoch_id',body.epochId).eq('root',body.root.toLowerCase()).maybeSingle();
  if(error) throw error;
  const {resolveBatchSchedule}=await import('@/lib/rewards/scheduleRenewal.server');
  const batch=original ? await resolveBatchSchedule(admin,original) : null;
  if(batch && batch.fingerprint!==body.fingerprint) return jsonResponse({error:'Review expired or schedule changed. Re-check and review the current authorized batch. No wallet request submitted.'},409);
  if(!batch || !Array.isArray(batch.leaves) || !batch.leaves.length) return jsonResponse({error:'The reviewed snapshot does not match the stored batch. Refresh and review the existing batch again; no wallet request was submitted.'},409);
  if(request.method==='PUT') {
   const {buildRewardSolvencyReport}=await import('@/lib/rewards/rewardSolvency.server');
   const fresh=(await buildRewardSolvencyReport()).settlement;
   if(fresh.status!=='READY_FOR_PUBLISHER_REVIEW' || fresh.fingerprint!==batch.fingerprint || fresh.root!==batch.root || !fresh.tx || !fresh.simulation?.ok) return jsonResponse({error:`Stored batch validation failed (${fresh.reason ?? 'snapshot mismatch'}). No wallet request submitted. Refresh and review again; an expired stored claim window requires separately authorized replacement.`},409);
   const {integerWei,immutableBatchCalldata}=await import('@/lib/rewards/immutableBatch');
   const expected=immutableBatchCalldata({epochId:batch.epoch_id,root:batch.root as `0x${string}`,totalWei:integerWei(batch.total_wei),claimStart:Number(batch.claim_start),claimEnd:Number(batch.claim_end),leaves:batch.leaves as never});
   if(fresh.epochId!==batch.epoch_id || fresh.tx.to.toLowerCase()!==DISTRIBUTOR.toLowerCase() || fresh.tx.chainId!==677 || fresh.tx.value!=='0' || fresh.tx.data.toLowerCase()!==expected.toLowerCase()) return jsonResponse({error:'Stored batch payload mismatch. Refresh and review again; no wallet request submitted.'},409);
   const {publicationPreflight}=await import('@/lib/rewards/publisherReconciliation.server');
   const live=await publicationPreflight(batch.epoch_id);
   if(!live.epochAvailable || live.latest!==live.pending) return jsonResponse({error:'Published epoch or unresolved publisher nonce; reconcile first'},409);
   if(!fresh.tx.data) return jsonResponse({error:'Missing exact transaction'},409);
   const {publicationClient}=await import('@/lib/rewards/publisherReconciliation.server');
   await publicationClient().call({account:SETTLEMENT_SIGNER.address,to:DISTRIBUTOR,data:expected});
   const {data:operation,error:lockError}=await admin.rpc('acquire_reviewed_reward_publication',{p_batch:batch.id,p_actor:gate.admin.userId,p_sender:gate.admin.wallet,p_nonce:live.pending,p_calldata:fresh.tx.data,p_start:Number(live.head),p_fingerprint:batch.fingerprint});
   if(lockError || !operation) return jsonResponse({error:'Epoch locked; recover the original operation before retrying'},409);
   const {data:a}=await admin.from('reward_publish_attempts').select('id').eq('operation_id',operation).single();
   return jsonResponse({attemptId:a?.id,operationId:operation,nonce:live.pending});
  }
  if(typeof body.attemptId!=='string') return jsonResponse({error:'Original attempt required'},400);
  const {data:attempt,error:attemptError}=await admin.from('reward_publish_attempts').select('*').eq('id',body.attemptId).eq('batch_id',batch.id).eq('operator_id',gate.admin.userId).maybeSingle();
  if(attemptError) throw attemptError;
  if(!attempt || attempt.operation_id!==body.operationId) return jsonResponse({error:'Original operation mismatch; reload recovery'},409);
  if(attempt.phase==='CONFIRMED_VERIFIED') return jsonResponse({phase:'CONFIRMED_VERIFIED',retrySafe:false});
  const transition=async(phase:string,hash:string|null,safe=false)=> {
   const {error}=await admin.rpc('transition_reward_publication',{p_attempt:attempt.id,p_operation:attempt.operation_id,p_actor:gate.admin.userId,p_phase:phase,p_hash:hash ?? undefined,p_retry_safe:safe});
   if(error) throw error;
  };
  const {publicationPreflight,recoverPublisherHash,publicationNonceMatches}=await import('@/lib/rewards/publisherReconciliation.server');
  if(request.method==='PATCH') {
   if(body.operationId!==attempt.operation_id) return jsonResponse({error:'Operation ownership required'},409);
   const live=await publicationPreflight(batch.epoch_id);
   const {isPublisherCancellation}=await import('@/lib/rewards/publisherRecovery');
   const cancelled=body.action==='cancel' && attempt.phase==='AWAITING_WALLET' && isPublisherCancellation(body.cancellation) && !attempt.tx_hash && live.epochAvailable && live.latest===attempt.sender_nonce && live.pending===attempt.sender_nonce;
   if(cancelled) {await transition('CANCELLED',null,true);return jsonResponse({phase:'CANCELLED',retrySafe:true});}
   if(!attempt.tx_hash && !body.txHash) body.txHash=await recoverPublisherHash(attempt,live.head);
   if(!attempt.tx_hash && !body.txHash) {await transition('RECOVERY_REQUIRED',null);return jsonResponse({phase:'RECOVERY_REQUIRED',retrySafe:false});}
  }
  if(attempt.tx_hash && body.txHash && attempt.tx_hash!==String(body.txHash).toLowerCase()) return jsonResponse({error:'Original hash mismatch'},409);
  body.txHash=attempt.tx_hash ?? body.txHash;
  if(!/^0x[0-9a-f]{64}$/i.test(body.txHash ?? '')) return jsonResponse({error:'Original transaction hash required; use Recover Stuck Batch'},400);
  body.txHash=body.txHash.toLowerCase();
  if(attempt.tx_hash && attempt.tx_hash!==body.txHash) return jsonResponse({error:'Original hash mismatch'},409);
  if(attempt.retry_safe) return jsonResponse({phase:attempt.phase,retrySafe:true});
  if(!await publicationNonceMatches(body.txHash,attempt.sender_nonce)) return jsonResponse({error:'Original publisher nonce mismatch; keep the batch locked'},409);
  await transition('CONFIRMING',body.txHash);
  const {verifyPublicationOnChain}=await import('@/lib/rewards/publicationRecovery.server');
  const {integerWei}=await import('@/lib/rewards/immutableBatch');
  const result=await verifyPublicationOnChain({epochId:batch.epoch_id,root:batch.root as `0x${string}`,totalWei:integerWei(batch.total_wei),claimStart:Number(batch.claim_start),claimEnd:Number(batch.claim_end),leaves:batch.leaves as never},body.txHash,gate.admin.wallet);
  if(result.phase==='CONFIRMED_VERIFIED' && result.blockHash && result.blockNumber) {
   const {error:saveError}=await admin.rpc('confirm_reward_publication',{p_attempt:attempt.id,p_hash:body.txHash,p_block_hash:result.blockHash,p_block: Number(result.blockNumber),p_actor:gate.admin.userId,p_email:gate.admin.email,p_role:gate.admin.role});
   if(saveError) throw saveError;
  } else {
   let retrySafe=false;
   if(result.phase==='REVERTED') {
    const live=await publicationPreflight(batch.epoch_id);
    retrySafe=live.epochAvailable && live.latest===live.pending && await publicationNonceMatches(body.txHash,attempt.sender_nonce);
   }
   await transition(result.phase,body.txHash,retrySafe);
   return jsonResponse({...result,retrySafe});
  }
  return jsonResponse(result);
 } catch {
  return jsonResponse({error:'Verification unavailable. Keep the original transaction; re-check only.'},503);
 }
}
export const Route=createFileRoute('/api/admin/rewards-publish-verify')({server:{handlers:{GET:({request})=>handle(request),PUT:({request})=>handle(request),POST:({request})=>handle(request),PATCH:({request})=>handle(request)}}});
