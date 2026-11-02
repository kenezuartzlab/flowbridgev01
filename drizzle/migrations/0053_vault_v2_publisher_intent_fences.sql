CREATE TABLE public.reward_vault_v2_signing_attempts(operation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id text NOT NULL REFERENCES public.reward_vault_v2_batches(batch_id), actor_user_id uuid NOT NULL, publisher text NOT NULL, nonce bigint NOT NULL CHECK(nonce>=0), start_block bigint NOT NULL, calldata text NOT NULL, phase text NOT NULL DEFAULT 'SIGNATURE' CHECK(phase IN ('SIGNATURE','SUBMITTED','UNKNOWN','CANCELLED','REVERTED','CREDITED')), tx_hash text UNIQUE CHECK(tx_hash ~ '^0x[0-9a-f]{64}$'), evidence jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.reward_vault_v2_signing_attempts TO service_role;
ALTER TABLE public.reward_vault_v2_signing_attempts ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX vault_v2_one_active_batch ON public.reward_vault_v2_signing_attempts(batch_id) WHERE phase NOT IN ('CANCELLED','REVERTED');
CREATE UNIQUE INDEX vault_v2_one_active_nonce ON public.reward_vault_v2_signing_attempts(publisher,nonce) WHERE phase NOT IN ('CANCELLED','REVERTED');
CREATE FUNCTION public.acquire_vault_v2_signing(p_batch text,p_actor uuid,p_wallet text,p_nonce bigint,p_start bigint,p_calldata text,p_source_hash text,p_free numeric,p_daily numeric,p_observed timestamptz) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c reward_vault_v2_config; b reward_vault_v2_batches; op uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('reward-destination-fence'));
 SELECT * INTO c FROM reward_vault_v2_config WHERE id FOR UPDATE;
 SELECT * INTO b FROM reward_vault_v2_batches WHERE batch_id=p_batch FOR UPDATE;
 IF c IS NULL OR NOT c.financial_enabled OR NOT c.deployment_verified OR NOT c.cutover_accepted OR c.authorized_by IS NULL OR c.cutover_at IS NULL OR c.cutover_at>now() OR c.chain_id<>677 OR c.batch_cap_wei<=0 OR c.daily_cap_wei<c.batch_cap_wei OR b IS NULL OR b.state='CREDITED' OR b.contract_address IS DISTINCT FROM c.contract_address OR b.publisher IS DISTINCT FROM c.publisher OR p_wallet IS DISTINCT FROM c.publisher THEN RAISE EXCEPTION 'VAULT_V2_DISABLED_OR_PUBLISHER_MISMATCH'; END IF;
 IF NOT EXISTS(SELECT 1 FROM profiles p JOIN auth.users u ON u.id=p.id JOIN app_admins a ON lower(a.email)=lower(p.email) WHERE p.id=p_actor AND lower(p.wallet_address)=p_wallet AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<now()) AND a.role IN ('super_admin','internal_operator') AND NOT coalesce(a.disabled,false)) THEN RAISE EXCEPTION 'authenticated bound publisher required'; END IF;
 SELECT operation_id INTO op FROM reward_vault_v2_signing_attempts WHERE batch_id=p_batch AND phase NOT IN ('CANCELLED','REVERTED');
 IF op IS NOT NULL THEN RAISE EXCEPTION 'resume existing signing operation; never resend'; END IF;
 PERFORM 1 FROM profiles WHERE id IN(SELECT user_id FROM reward_economic_award_allocations WHERE vault_batch_id=p_batch) ORDER BY id FOR SHARE;
 PERFORM 1 FROM reward_budgets ORDER BY program_id FOR SHARE;
 PERFORM 1 FROM flow_points_ledger WHERE id=ANY(b.source_ids) ORDER BY id FOR SHARE;
 IF p_source_hash IS DISTINCT FROM b.snapshot_hash OR p_source_hash IS DISTINCT FROM vault_v2_source_hash(b.source_ids) OR p_nonce IS NULL OR p_nonce<0 OR p_start IS NULL OR p_start<0 OR coalesce(p_calldata,'') !~ '^0x[0-9a-f]+$' OR p_observed IS NULL OR p_observed<now()-interval '30 seconds' OR p_observed>now()+interval '5 seconds' OR p_free IS NULL OR p_daily IS NULL OR b.total_wei>p_free OR b.total_wei>p_daily OR b.total_wei>c.batch_cap_wei THEN RAISE EXCEPTION 'stale snapshot backing or cap'; END IF;
 IF (SELECT count(*) FROM reward_economic_award_allocations a JOIN reward_award_destinations d ON d.ledger_id=a.ledger_id AND d.economic_award_id=a.economic_award_id AND d.destination='VAULT_V2' JOIN flow_points_ledger l ON l.id=a.ledger_id AND l.points=a.points AND l.user_id=a.user_id AND l.created_at>c.cutover_at AND l.funding_state='FUNDED' JOIN profiles p ON p.id=l.user_id AND lower(p.wallet_address)=a.wallet JOIN auth.users u ON u.id=p.id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<now()) JOIN reward_reservations r ON r.ledger_id=l.id AND r.reservation_id=l.reservation_id AND r.points=l.points AND r.user_id=l.user_id AND r.program_id=l.program_id AND lower(r.wallet_address)=a.wallet JOIN reward_budgets f ON f.program_id=l.program_id AND f.funding_verified AND f.status='ACTIVE' AND f.reserved_points<=f.total_points WHERE a.vault_batch_id=p_batch AND a.destination='VAULT_V2' AND l.id=ANY(b.source_ids) AND ((l.program_id='CORE_SWAP' AND l.chain_id=677 AND l.policy_version='FLOW_POINTS_V2' AND l.provenance_state='VERIFIED') OR (l.program_id='SIGNUP_BONUS' AND l.policy_version='FUNDED_SIGNUP_BONUS_V1')))<>cardinality(b.source_ids) THEN RAISE EXCEPTION 'award fence funding or binding changed'; END IF;
 INSERT INTO reward_vault_v2_signing_attempts(batch_id,actor_user_id,publisher,nonce,start_block,calldata) VALUES(p_batch,p_actor,p_wallet,p_nonce,p_start,p_calldata) RETURNING operation_id INTO op;
 INSERT INTO admin_audit_events(actor_user_id,actor_role,object_type,object_id,action,new_value) VALUES(p_actor,'publisher','reward_vault_v2',p_batch,'SIGNING_INTENT_ACQUIRED',jsonb_build_object('operationId',op,'nonce',p_nonce,'startBlock',p_start));
 RETURN op;
END $$;
REVOKE ALL ON FUNCTION public.acquire_vault_v2_signing(text,uuid,text,bigint,bigint,text,text,numeric,numeric,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_vault_v2_signing(text,uuid,text,bigint,bigint,text,text,numeric,numeric,timestamptz) TO service_role;
CREATE FUNCTION public.transition_vault_v2_signing(p_operation uuid,p_actor uuid,p_wallet text,p_phase text,p_hash text,p_evidence jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a reward_vault_v2_signing_attempts;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('reward-destination-fence'));
 SELECT * INTO a FROM reward_vault_v2_signing_attempts WHERE operation_id=p_operation FOR UPDATE;
 IF a IS NULL OR a.publisher IS DISTINCT FROM p_wallet OR a.actor_user_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'signing operation owner mismatch'; END IF;
 IF a.phase IN ('CANCELLED','REVERTED','CREDITED') THEN IF a.phase=p_phase AND a.tx_hash IS NOT DISTINCT FROM p_hash THEN RETURN false; ELSE RAISE EXCEPTION 'final operation immutable'; END IF; END IF;
 IF p_phase NOT IN ('SUBMITTED','UNKNOWN','CANCELLED','REVERTED','CREDITED') OR (a.tx_hash IS NOT NULL AND a.tx_hash IS DISTINCT FROM p_hash) THEN RAISE EXCEPTION 'invalid signing transition'; END IF;
 IF p_phase='CANCELLED' AND (a.tx_hash IS NOT NULL OR p_hash IS NOT NULL OR coalesce(p_evidence->>'verification','')<>'EXPLICIT_4001_NO_SEND' OR p_evidence->>'nonce' IS DISTINCT FROM a.nonce::text) THEN RAISE EXCEPTION 'cancellation requires explicit unchanged nonce evidence'; END IF;
 IF p_phase IN ('SUBMITTED','REVERTED','CREDITED') AND (p_hash IS NULL OR p_hash !~ '^0x[0-9a-f]{64}$') THEN RAISE EXCEPTION 'verified hash required'; END IF;
 IF p_phase='REVERTED' AND coalesce(p_evidence->>'verification','')<>'EXACT_CANONICAL_REVERT' THEN RAISE EXCEPTION 'exact revert required'; END IF;
 IF p_phase='CREDITED' AND NOT EXISTS(SELECT 1 FROM reward_vault_v2_batches WHERE batch_id=a.batch_id AND state='CREDITED' AND tx_hash=p_hash) THEN RAISE EXCEPTION 'credit not committed'; END IF;
 UPDATE reward_vault_v2_signing_attempts SET phase=p_phase,tx_hash=p_hash,evidence=p_evidence,updated_at=now() WHERE operation_id=p_operation;
 INSERT INTO admin_audit_events(actor_user_id,actor_role,object_type,object_id,action,new_value) VALUES(p_actor,'publisher','reward_vault_v2',a.batch_id,'SIGNING_'||p_phase,jsonb_build_object('operationId',p_operation,'hash',p_hash,'evidence',p_evidence));
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.transition_vault_v2_signing(uuid,uuid,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.transition_vault_v2_signing(uuid,uuid,text,text,text,jsonb) TO service_role;