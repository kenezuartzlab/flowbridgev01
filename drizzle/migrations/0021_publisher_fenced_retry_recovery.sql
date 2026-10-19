ALTER TABLE public.reward_publish_attempts ADD COLUMN operation_id uuid NOT NULL DEFAULT gen_random_uuid(), ADD COLUMN sender text, ADD COLUMN sender_nonce bigint, ADD COLUMN expected_calldata text, ADD COLUMN start_block bigint, ADD COLUMN retry_safe boolean NOT NULL DEFAULT false, ADD COLUMN retry_history jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE OR REPLACE FUNCTION public.acquire_reward_publication(p_batch uuid,p_actor uuid,p_sender text,p_nonce bigint,p_calldata text,p_start bigint) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a public.reward_publish_attempts; b public.reward_settlement_batches; op uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO b FROM public.reward_settlement_batches WHERE id=p_batch FOR UPDATE;
 IF NOT FOUND OR b.epoch_id<=2 OR b.publication_verified_at IS NOT NULL THEN RAISE EXCEPTION 'published or missing batch'; END IF;
 SELECT * INTO a FROM public.reward_publish_attempts WHERE chain_id=677 AND distributor=b.distributor AND epoch_id=b.epoch_id FOR UPDATE;
 IF FOUND THEN
  IF a.operator_id<>p_actor OR NOT a.retry_safe OR a.phase NOT IN ('CANCELLED','REVERTED') THEN RAISE EXCEPTION 'publication locked; reconcile original operation'; END IF;
  UPDATE public.reward_publish_attempts SET retry_history=retry_history||jsonb_build_array(jsonb_build_object('operationId',operation_id,'hash',tx_hash,'phase',phase,'nonce',sender_nonce,'at',now())), batch_id=b.id,root=b.root,fingerprint=b.fingerprint,operation_id=op,sender=lower(p_sender),sender_nonce=p_nonce,expected_calldata=lower(p_calldata),start_block=p_start,tx_hash=NULL,phase='AWAITING_WALLET',retry_safe=false,updated_at=now() WHERE id=a.id;
 ELSE
  INSERT INTO public.reward_publish_attempts(batch_id,chain_id,distributor,epoch_id,root,fingerprint,operator_id,operation_id,sender,sender_nonce,expected_calldata,start_block,phase) VALUES(b.id,677,b.distributor,b.epoch_id,b.root,b.fingerprint,p_actor,op,lower(p_sender),p_nonce,lower(p_calldata),p_start,'AWAITING_WALLET');
 END IF;
 RETURN op;
END $$;
CREATE OR REPLACE FUNCTION public.transition_reward_publication(p_attempt uuid,p_operation uuid,p_actor uuid,p_phase text,p_hash text DEFAULT NULL,p_retry_safe boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a public.reward_publish_attempts;
BEGIN
 SELECT * INTO a FROM public.reward_publish_attempts WHERE id=p_attempt FOR UPDATE;
 IF NOT FOUND OR a.operation_id<>p_operation OR a.operator_id<>p_actor THEN RAISE EXCEPTION 'operation ownership mismatch'; END IF;
 IF a.phase='CONFIRMED_VERIFIED' THEN RETURN false; END IF;
 IF p_phase NOT IN ('CANCELLED','BROADCAST_PENDING','CONFIRMING','REVERTED','RECOVERY_REQUIRED','CONFIRMED_MISMATCH') THEN RAISE EXCEPTION 'invalid phase'; END IF;
 IF a.retry_safe THEN RETURN false; END IF;
 IF a.tx_hash IS NOT NULL AND p_hash IS DISTINCT FROM a.tx_hash THEN RAISE EXCEPTION 'original hash required'; END IF;
 IF p_hash IS NOT NULL AND p_hash !~ '^0x[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid hash'; END IF;
 IF p_retry_safe AND NOT ((p_phase='CANCELLED' AND a.tx_hash IS NULL AND p_hash IS NULL) OR (p_phase='REVERTED' AND p_hash IS NOT NULL)) THEN RAISE EXCEPTION 'unsafe release'; END IF;
 UPDATE public.reward_publish_attempts SET phase=p_phase,tx_hash=coalesce(tx_hash,p_hash),retry_safe=p_retry_safe,updated_at=now() WHERE id=a.id;
 INSERT INTO public.admin_audit_events(actor_user_id,object_type,object_id,action,new_value,reason) VALUES(p_actor,'reward_round','677:'||a.epoch_id,'PUBLISH_'||p_phase,jsonb_build_object('operationId',p_operation,'txHash',p_hash,'retrySafe',p_retry_safe),'authorized fenced recovery');
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.acquire_reward_publication(uuid,uuid,text,bigint,text,bigint),public.transition_reward_publication(uuid,uuid,uuid,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_reward_publication(uuid,uuid,text,bigint,text,bigint),public.transition_reward_publication(uuid,uuid,uuid,text,text,boolean) TO service_role;