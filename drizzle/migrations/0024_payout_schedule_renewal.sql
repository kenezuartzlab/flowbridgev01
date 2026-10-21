CREATE TABLE public.reward_schedule_renewals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES public.reward_settlement_batches(id), original_fingerprint text NOT NULL, fingerprint text NOT NULL UNIQUE, claim_start bigint NOT NULL, claim_end bigint NOT NULL, min_publish_delay bigint NOT NULL, evidence_hash text NOT NULL, status text NOT NULL DEFAULT 'PROPOSED' CHECK(status IN ('PROPOSED','APPROVED')), proposed_by uuid, approved_by uuid, created_at timestamptz NOT NULL DEFAULT now(), approved_at timestamptz
);
GRANT ALL ON public.reward_schedule_renewals TO service_role;
ALTER TABLE public.reward_schedule_renewals ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX reward_schedule_one_approved ON public.reward_schedule_renewals(batch_id) WHERE status='APPROVED';
CREATE FUNCTION public.reward_payout_evidence_hash() RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT encode(sha256(convert_to(jsonb_build_object('ledger',(SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY id),'[]') FROM flow_points_ledger l),'reservations',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY reservation_id),'[]') FROM reward_reservations r),'budgets',(SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY program_id),'[]') FROM reward_budgets b),'wallets',(SELECT coalesce(jsonb_agg(jsonb_build_array(id,wallet_address) ORDER BY id),'[]') FROM profiles))::text,'UTF8')),'hex')
$$;
REVOKE ALL ON FUNCTION public.reward_payout_evidence_hash() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reward_payout_evidence_hash() TO service_role;
CREATE FUNCTION public.approve_reward_schedule(p_id uuid,p_actor uuid,p_email text,p_wallet text,p_evidence text,p_now bigint,p_delay bigint) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r reward_schedule_renewals; b reward_settlement_batches;
BEGIN
 SELECT * INTO r FROM reward_schedule_renewals WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'renewal missing'; END IF;
 SELECT * INTO b FROM reward_settlement_batches WHERE id=r.batch_id FOR UPDATE;
 PERFORM 1 FROM reward_schedule_renewals WHERE id=p_id FOR UPDATE;
 SELECT * INTO r FROM reward_schedule_renewals WHERE id=p_id;
 IF NOT EXISTS(SELECT 1 FROM app_admins WHERE lower(email)=lower(p_email) AND role='super_admin' AND NOT coalesce(disabled,false)) OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_actor AND lower(wallet_address)=lower(p_wallet)) THEN RAISE EXCEPTION 'approval authority required'; END IF;
 IF r.status='APPROVED' THEN RETURN false; END IF;
 IF b.publication_verified_at IS NOT NULL OR b.fingerprint<>r.original_fingerprint OR b.epoch_id<=2 OR b.chain_id<>677 THEN RAISE EXCEPTION 'original changed or confirmed'; END IF;
 IF EXISTS(SELECT 1 FROM reward_publish_attempts WHERE batch_id=b.id) THEN RAISE EXCEPTION 'publication attempt must be reconciled; renewal locked'; END IF;
 IF p_delay<86400 OR p_delay<>r.min_publish_delay OR r.claim_start<p_now+p_delay OR r.claim_end-r.claim_start<>2592000 THEN RAISE EXCEPTION 'schedule expired or delay changed'; END IF;
 IF p_evidence<>r.evidence_hash OR reward_payout_evidence_hash()<>r.evidence_hash THEN RAISE EXCEPTION 'funding evidence changed; review again'; END IF;
 UPDATE reward_schedule_renewals SET status='APPROVED',approved_by=p_actor,approved_at=now() WHERE id=r.id;
 INSERT INTO admin_audit_events(actor_user_id,actor_email,actor_role,object_type,object_id,action,old_value,new_value,reason) VALUES(p_actor,p_email,'super_admin','reward_round','677:'||b.epoch_id,'SCHEDULE_RENEWAL_APPROVED',jsonb_build_object('batchId',b.id,'fingerprint',b.fingerprint,'claimStart',b.claim_start,'claimEnd',b.claim_end),jsonb_build_object('renewalId',r.id,'fingerprint',r.fingerprint,'claimStart',r.claim_start,'claimEnd',r.claim_end,'root',b.root,'totalWei',b.total_wei::text),'Explicit schedule-only approval; original batch preserved, no signature or publication');
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.approve_reward_schedule(uuid,uuid,text,text,text,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.approve_reward_schedule(uuid,uuid,text,text,text,bigint,bigint) TO service_role;
CREATE OR REPLACE FUNCTION public.acquire_reward_publication(p_batch uuid,p_actor uuid,p_sender text,p_nonce bigint,p_calldata text,p_start bigint) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a public.reward_publish_attempts; b public.reward_settlement_batches; r public.reward_schedule_renewals; op uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO b FROM public.reward_settlement_batches WHERE id=p_batch FOR UPDATE;
 IF NOT FOUND OR b.chain_id<>677 OR b.epoch_id<=2 OR b.publication_verified_at IS NOT NULL THEN RAISE EXCEPTION 'published or missing batch'; END IF;
 SELECT * INTO r FROM reward_schedule_renewals WHERE batch_id=b.id AND status='APPROVED';
 IF FOUND THEN b.fingerprint:=r.fingerprint; b.claim_start:=r.claim_start; b.claim_end:=r.claim_end; END IF;
 SELECT * INTO a FROM public.reward_publish_attempts WHERE chain_id=677 AND distributor=b.distributor AND epoch_id=b.epoch_id FOR UPDATE;
 IF FOUND THEN
  IF a.operator_id<>p_actor OR NOT a.retry_safe OR a.phase NOT IN ('CANCELLED','REVERTED') THEN RAISE EXCEPTION 'publication locked; reconcile original operation'; END IF;
  IF a.phase='CANCELLED' AND (a.sender_nonce IS DISTINCT FROM p_nonce OR a.expected_calldata IS DISTINCT FROM lower(p_calldata) OR a.sender IS DISTINCT FROM lower(p_sender) OR a.batch_id<>b.id OR a.root<>b.root OR a.fingerprint<>b.fingerprint) THEN RAISE EXCEPTION 'cancelled authorization must retain exact sender nonce and payload'; END IF;
  UPDATE public.reward_publish_attempts SET retry_history=retry_history||jsonb_build_array(jsonb_build_object('operationId',operation_id,'hash',tx_hash,'phase',phase,'nonce',sender_nonce,'at',now())),batch_id=b.id,root=b.root,fingerprint=b.fingerprint,operation_id=op,sender=lower(p_sender),sender_nonce=p_nonce,expected_calldata=lower(p_calldata),start_block=p_start,tx_hash=NULL,phase='AWAITING_WALLET',retry_safe=false,updated_at=now() WHERE id=a.id;
 ELSE
  INSERT INTO public.reward_publish_attempts(batch_id,chain_id,distributor,epoch_id,root,fingerprint,operator_id,operation_id,sender,sender_nonce,expected_calldata,start_block,phase) VALUES(b.id,677,b.distributor,b.epoch_id,b.root,b.fingerprint,p_actor,op,lower(p_sender),p_nonce,lower(p_calldata),p_start,'AWAITING_WALLET');
 END IF;
 RETURN op;
END $$;
REVOKE ALL ON FUNCTION public.acquire_reward_publication(uuid,uuid,text,bigint,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_reward_publication(uuid,uuid,text,bigint,text,bigint) TO service_role;
CREATE OR REPLACE FUNCTION public.confirm_reward_publication(p_attempt uuid,p_hash text,p_block_hash text,p_block bigint,p_actor uuid,p_email text,p_role text) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a public.reward_publish_attempts; b public.reward_settlement_batches; r public.reward_schedule_renewals;
BEGIN
 SELECT * INTO a FROM public.reward_publish_attempts WHERE id=p_attempt FOR UPDATE;
 IF NOT FOUND OR a.tx_hash IS DISTINCT FROM lower(p_hash) THEN RAISE EXCEPTION 'attempt mismatch'; END IF;
 SELECT * INTO b FROM public.reward_settlement_batches WHERE id=a.batch_id FOR UPDATE;
 SELECT * INTO r FROM reward_schedule_renewals WHERE batch_id=b.id AND status='APPROVED';
 IF FOUND THEN b.fingerprint:=r.fingerprint; END IF;
 IF b.root<>a.root OR b.fingerprint<>a.fingerprint OR b.epoch_id<>a.epoch_id THEN RAISE EXCEPTION 'batch changed'; END IF;
 IF a.phase='CONFIRMED_VERIFIED' AND a.block_hash=p_block_hash THEN RETURN false; END IF;
 UPDATE reward_settlement_batches SET publication_verified_at=coalesce(publication_verified_at,now()) WHERE id=b.id;
 UPDATE reward_publish_attempts SET phase='CONFIRMED_VERIFIED',block_hash=p_block_hash,block_number=p_block,updated_at=now() WHERE id=a.id;
 INSERT INTO admin_audit_events(actor_user_id,actor_email,actor_role,object_type,object_id,action,new_value,reason) VALUES(p_actor,p_email,p_role,'reward_round','677:'||a.epoch_id,'PUBLISH_CONFIRMED_VERIFIED',jsonb_build_object('txHash',lower(p_hash),'root',a.root,'block',p_block::text,'blockHash',p_block_hash),'canonical publisher receipt verification');
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.confirm_reward_publication(uuid,text,text,bigint,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_reward_publication(uuid,text,text,bigint,uuid,text,text) TO service_role;