CREATE OR REPLACE FUNCTION public.acquire_reward_publication(p_batch uuid,p_actor uuid,p_sender text,p_nonce bigint,p_calldata text,p_start bigint) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a public.reward_publish_attempts; b public.reward_settlement_batches; op uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO b FROM public.reward_settlement_batches WHERE id=p_batch FOR UPDATE;
 IF NOT FOUND OR b.chain_id<>677 OR b.epoch_id<=2 OR b.publication_verified_at IS NOT NULL THEN RAISE EXCEPTION 'published or missing batch'; END IF;
 SELECT * INTO a FROM public.reward_publish_attempts WHERE chain_id=677 AND distributor=b.distributor AND epoch_id=b.epoch_id FOR UPDATE;
 IF FOUND THEN
  IF a.operator_id<>p_actor OR NOT a.retry_safe OR a.phase NOT IN ('CANCELLED','REVERTED') THEN RAISE EXCEPTION 'publication locked; reconcile original operation'; END IF;
  IF a.phase='CANCELLED' AND (a.sender_nonce IS DISTINCT FROM p_nonce OR a.expected_calldata IS DISTINCT FROM lower(p_calldata) OR a.sender IS DISTINCT FROM lower(p_sender) OR a.batch_id<>b.id OR a.root<>b.root OR a.fingerprint<>b.fingerprint) THEN RAISE EXCEPTION 'cancelled authorization must retain exact sender nonce and payload'; END IF;
  UPDATE public.reward_publish_attempts SET retry_history=retry_history||jsonb_build_array(jsonb_build_object('operationId',operation_id,'hash',tx_hash,'phase',phase,'nonce',sender_nonce,'at',now())), batch_id=b.id,root=b.root,fingerprint=b.fingerprint,operation_id=op,sender=lower(p_sender),sender_nonce=p_nonce,expected_calldata=lower(p_calldata),start_block=p_start,tx_hash=NULL,phase='AWAITING_WALLET',retry_safe=false,updated_at=now() WHERE id=a.id;
 ELSE
  INSERT INTO public.reward_publish_attempts(batch_id,chain_id,distributor,epoch_id,root,fingerprint,operator_id,operation_id,sender,sender_nonce,expected_calldata,start_block,phase) VALUES(b.id,677,b.distributor,b.epoch_id,b.root,b.fingerprint,p_actor,op,lower(p_sender),p_nonce,lower(p_calldata),p_start,'AWAITING_WALLET');
 END IF;
 RETURN op;
END $$;
REVOKE ALL ON FUNCTION public.acquire_reward_publication(uuid,uuid,text,bigint,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_reward_publication(uuid,uuid,text,bigint,text,bigint) TO service_role;