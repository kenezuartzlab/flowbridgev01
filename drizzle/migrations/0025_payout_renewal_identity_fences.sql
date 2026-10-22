ALTER TABLE public.reward_schedule_renewals ADD COLUMN previous_fingerprint text;
UPDATE public.reward_schedule_renewals SET previous_fingerprint=original_fingerprint WHERE previous_fingerprint IS NULL;
ALTER TABLE public.reward_schedule_renewals DROP CONSTRAINT reward_schedule_renewals_status_check;
ALTER TABLE public.reward_schedule_renewals ADD CONSTRAINT reward_schedule_renewals_status_check CHECK(status IN ('PROPOSED','APPROVED','SUPERSEDED'));
CREATE OR REPLACE FUNCTION public.approve_reward_schedule(p_id uuid,p_actor uuid,p_email text,p_wallet text,p_evidence text,p_now bigint,p_delay bigint) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r reward_schedule_renewals; b reward_settlement_batches; active_fingerprint text;
BEGIN
 SELECT * INTO r FROM reward_schedule_renewals WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'renewal missing'; END IF;
 SELECT * INTO b FROM reward_settlement_batches WHERE id=r.batch_id FOR UPDATE;
 SELECT * INTO r FROM reward_schedule_renewals WHERE id=p_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM profiles p JOIN app_admins a ON lower(a.email)=lower(p.email) WHERE p.id=p_actor AND lower(p.email)=lower(p_email) AND lower(p.wallet_address)=lower(p_wallet) AND a.role='super_admin' AND NOT coalesce(a.disabled,false)) THEN RAISE EXCEPTION 'approval authority required'; END IF;
 IF r.status='APPROVED' THEN RETURN false; END IF;
 IF r.status<>'PROPOSED' OR b.publication_verified_at IS NOT NULL OR b.fingerprint<>r.original_fingerprint OR b.epoch_id<=2 OR b.chain_id<>677 THEN RAISE EXCEPTION 'original changed or confirmed'; END IF;
 SELECT fingerprint INTO active_fingerprint FROM reward_schedule_renewals WHERE batch_id=b.id AND status='APPROVED';
 IF coalesce(active_fingerprint,b.fingerprint)<>coalesce(r.previous_fingerprint,r.original_fingerprint) THEN RAISE EXCEPTION 'approved schedule changed; review again'; END IF;
 PERFORM 1 FROM reward_publish_attempts WHERE batch_id=b.id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM reward_publish_attempts WHERE batch_id=b.id AND NOT (phase='REVERTED' AND retry_safe)) THEN RAISE EXCEPTION 'publication uncertainty locks renewal'; END IF;
 IF p_delay<86400 OR p_delay<>r.min_publish_delay OR r.claim_start<p_now+p_delay OR r.claim_end-r.claim_start<>2592000 THEN RAISE EXCEPTION 'schedule expired or delay changed'; END IF;
 IF p_evidence<>r.evidence_hash OR reward_payout_evidence_hash()<>r.evidence_hash THEN RAISE EXCEPTION 'funding evidence changed; review again'; END IF;
 UPDATE reward_schedule_renewals SET status='SUPERSEDED' WHERE batch_id=b.id AND status='APPROVED';
 UPDATE reward_schedule_renewals SET status='APPROVED',approved_by=p_actor,approved_at=now() WHERE id=r.id;
 INSERT INTO admin_audit_events(actor_user_id,actor_email,actor_role,object_type,object_id,action,old_value,new_value,reason) VALUES(p_actor,p_email,'super_admin','reward_round','677:'||b.epoch_id,'SCHEDULE_RENEWAL_APPROVED',jsonb_build_object('batchId',b.id,'baseFingerprint',b.fingerprint,'previousFingerprint',r.previous_fingerprint),jsonb_build_object('renewalId',r.id,'fingerprint',r.fingerprint,'claimStart',r.claim_start,'claimEnd',r.claim_end,'root',b.root,'totalWei',b.total_wei::text),'Explicit schedule-only approval; immutable base and previous approvals preserved');
 RETURN true;
END $$;
CREATE FUNCTION public.reward_uint256_hex(n numeric) RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=public AS $$
DECLARE result text:=''; digit integer; value numeric:=n;
BEGIN
 IF n<0 OR n<>trunc(n) OR n>=power(2::numeric,256) THEN RAISE EXCEPTION 'invalid uint256'; END IF;
 WHILE value>0 LOOP digit:=mod(value,16)::integer; result:=substr('0123456789abcdef',digit+1,1)||result; value:=trunc(value/16); END LOOP;
 RETURN lpad(result,64,'0');
END $$;
CREATE FUNCTION public.acquire_reviewed_reward_publication(p_batch uuid,p_actor uuid,p_sender text,p_nonce bigint,p_calldata text,p_start bigint,p_fingerprint text) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE b reward_settlement_batches; r reward_schedule_renewals; expected text;
BEGIN
 SELECT * INTO b FROM reward_settlement_batches WHERE id=p_batch FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'missing batch'; END IF;
 SELECT * INTO r FROM reward_schedule_renewals WHERE batch_id=b.id AND status='APPROVED';
 IF FOUND THEN b.fingerprint:=r.fingerprint; b.claim_start:=r.claim_start; b.claim_end:=r.claim_end; END IF;
 IF b.fingerprint<>p_fingerprint THEN RAISE EXCEPTION 'review expired; approved schedule changed'; END IF;
 expected:='0x34b7fe84'||substr(lower(b.root),3)||public.reward_uint256_hex(b.total_wei)||lpad(to_hex(b.claim_start),64,'0')||lpad(to_hex(b.claim_end),64,'0');
 IF lower(p_calldata)<>expected THEN RAISE EXCEPTION 'reviewed calldata mismatch'; END IF;
 RETURN public.acquire_reward_publication(p_batch,p_actor,p_sender,p_nonce,p_calldata,p_start);
END $$;
CREATE OR REPLACE FUNCTION public.confirm_reward_publication(p_attempt uuid,p_hash text,p_block_hash text,p_block bigint,p_actor uuid,p_email text,p_role text) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a reward_publish_attempts; b reward_settlement_batches; r reward_schedule_renewals; v_batch uuid; actor_role text; actor_email text;
BEGIN
 SELECT x.batch_id INTO v_batch FROM reward_publish_attempts x WHERE x.id=p_attempt;
 SELECT * INTO b FROM reward_settlement_batches WHERE id=v_batch FOR UPDATE;
 SELECT * INTO a FROM reward_publish_attempts WHERE id=p_attempt FOR UPDATE;
 IF NOT FOUND OR a.batch_id<>b.id OR a.tx_hash IS DISTINCT FROM lower(p_hash) THEN RAISE EXCEPTION 'attempt mismatch'; END IF;
 SELECT * INTO r FROM reward_schedule_renewals WHERE batch_id=b.id AND status='APPROVED';
 IF FOUND THEN b.fingerprint:=r.fingerprint; END IF;
 IF b.root<>a.root OR b.fingerprint<>a.fingerprint OR b.epoch_id<>a.epoch_id THEN RAISE EXCEPTION 'batch changed'; END IF;
 IF a.phase='CONFIRMED_VERIFIED' THEN
  IF a.block_hash=p_block_hash THEN RETURN false; END IF;
  RAISE EXCEPTION 'confirmed publication immutable';
 END IF;
 IF a.retry_safe OR a.phase NOT IN ('CONFIRMING','BROADCAST_PENDING','RECOVERY_REQUIRED','AWAITING_WALLET') OR p_block<0 OR p_block_hash !~ '^0x[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid confirmation'; END IF;
 IF p_actor IS NULL THEN actor_role:='system'; actor_email:=NULL;
 ELSE
  SELECT adm.role,p.email INTO actor_role,actor_email FROM profiles p JOIN app_admins adm ON lower(adm.email)=lower(p.email) WHERE p.id=p_actor AND NOT coalesce(adm.disabled,false);
  IF actor_role IS NULL OR p_actor<>a.operator_id OR lower(actor_email)<>lower(p_email) OR actor_role<>p_role THEN RAISE EXCEPTION 'authorized confirmation actor required'; END IF;
 END IF;
 UPDATE reward_settlement_batches SET publication_verified_at=coalesce(publication_verified_at,now()) WHERE id=b.id;
 UPDATE reward_publish_attempts SET phase='CONFIRMED_VERIFIED',block_hash=p_block_hash,block_number=p_block,updated_at=now() WHERE id=a.id;
 INSERT INTO admin_audit_events(actor_user_id,actor_email,actor_role,object_type,object_id,action,new_value,reason) VALUES(p_actor,actor_email,actor_role,'reward_round','677:'||a.epoch_id,'PUBLISH_CONFIRMED_VERIFIED',jsonb_build_object('txHash',lower(p_hash),'root',a.root,'block',p_block::text,'blockHash',p_block_hash,'operationId',a.operation_id,'originalOperatorId',a.operator_id),'canonical publisher receipt verification');
 RETURN true;
END $$;
CREATE FUNCTION public.reconcile_reward_publication(p_attempt uuid,p_operation uuid,p_hash text,p_block_hash text,p_block bigint) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a reward_publish_attempts; b reward_settlement_batches; v_batch uuid;
BEGIN
 SELECT x.batch_id INTO v_batch FROM reward_publish_attempts x WHERE x.id=p_attempt;
 SELECT * INTO b FROM reward_settlement_batches WHERE id=v_batch FOR UPDATE;
 SELECT * INTO a FROM reward_publish_attempts WHERE id=p_attempt FOR UPDATE;
 IF NOT FOUND OR a.batch_id<>b.id OR a.operation_id<>p_operation OR a.retry_safe OR p_hash !~ '^0x[0-9a-f]{64}$' OR (a.tx_hash IS NOT NULL AND a.tx_hash<>p_hash) THEN RAISE EXCEPTION 'original operation required'; END IF;
 IF a.phase='CONFIRMED_VERIFIED' THEN RETURN false; END IF;
 UPDATE reward_publish_attempts SET tx_hash=p_hash WHERE id=a.id;
 RETURN public.confirm_reward_publication(p_attempt,p_hash,p_block_hash,p_block,NULL,NULL,'system');
END $$;
REVOKE ALL ON FUNCTION public.acquire_reviewed_reward_publication(uuid,uuid,text,bigint,text,bigint,text),public.reconcile_reward_publication(uuid,uuid,text,text,bigint),public.reward_uint256_hex(numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_reviewed_reward_publication(uuid,uuid,text,bigint,text,bigint,text),public.reconcile_reward_publication(uuid,uuid,text,text,bigint),public.reward_uint256_hex(numeric) TO service_role;