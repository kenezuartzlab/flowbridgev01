CREATE FUNCTION public.vault_v2_source_rows_scan(p_after uuid,p_ids uuid[],p_limit integer) RETURNS TABLE(id uuid,user_id uuid,economic_award_id text,wallet text,points integer,program_id text,destination text,created_at timestamptz,policy_version text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT l.id,l.user_id,d.economic_award_id,lower(l.wallet_address),l.points,l.program_id,d.destination,l.created_at,l.policy_version FROM flow_points_ledger l JOIN reward_award_destinations d ON d.ledger_id=l.id AND d.destination='VAULT_V2' JOIN profiles p ON p.id=l.user_id AND lower(p.wallet_address)=lower(l.wallet_address) JOIN auth.users u ON u.id=p.id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<now()) JOIN reward_reservations r ON r.reservation_id=l.reservation_id AND r.ledger_id=l.id AND r.user_id=l.user_id AND r.points=l.points AND r.program_id=l.program_id AND lower(r.wallet_address)=lower(l.wallet_address) JOIN reward_budgets b ON b.program_id=l.program_id AND b.status='ACTIVE' AND b.funding_verified AND b.reserved_points<=b.total_points JOIN reward_vault_v2_config c ON c.id AND c.cutover_accepted AND l.created_at>c.cutover_at
 WHERE (p_after IS NULL OR l.id>p_after) AND (p_ids IS NULL OR l.id=ANY(p_ids)) AND l.points>0 AND l.funding_state='FUNDED' AND lower(l.wallet_address) ~ '^0x[0-9a-f]{40}$' AND lower(l.wallet_address)<>'0x0000000000000000000000000000000000000000' AND NOT EXISTS(SELECT 1 FROM reward_economic_award_allocations a WHERE a.ledger_id=l.id OR a.economic_award_id=d.economic_award_id)
 AND ((l.program_id='CORE_SWAP' AND l.policy_version='FLOW_POINTS_V2' AND l.chain_id=677 AND l.provenance_state='VERIFIED' AND l.verified_usd>=5 AND l.points<=floor(l.verified_usd) AND l.points<=1000 AND EXISTS(SELECT 1 FROM verified_activities v WHERE v.activity_id=l.verified_activity_id AND v.status='CONFIRMED' AND v.source_chain_id=677 AND lower(v.source_tx_hash)=lower(l.tx_hash) AND v.source_log_index=l.source_log_index AND lower(v.user_wallet)=lower(l.wallet_address))) OR (l.program_id='SIGNUP_BONUS' AND l.policy_version='FUNDED_SIGNUP_BONUS_V1' AND l.points=100 AND (l.chain_id IS NULL OR l.chain_id=677) AND l.reason IN ('SIGNUP_BONUS_REFEREE','REFERRAL_SIGNUP_BONUS') AND EXISTS(SELECT 1 FROM flow_points_ledger q JOIN profiles qp ON qp.id=q.user_id JOIN auth.users qu ON qu.id=q.user_id AND qu.email_confirmed_at IS NOT NULL AND (qu.banned_until IS NULL OR qu.banned_until<now()) WHERE q.reason='SIGNUP_BONUS_REFEREE' AND q.policy_version='FUNDED_SIGNUP_BONUS_V1' AND q.points=100 AND qp.created_at>='2026-10-04T01:00:00Z' AND lower(qp.wallet_address)=lower(q.wallet_address) AND q.user_id=CASE WHEN l.reason='SIGNUP_BONUS_REFEREE' THEN l.user_id ELSE (l.metadata->>'refereeId')::uuid END AND l.activity_key=CASE WHEN l.reason='SIGNUP_BONUS_REFEREE' THEN 'signup:'||q.user_id::text ELSE 'signup-ref:'||q.user_id::text END AND (SELECT count(*) FROM flow_points_ledger z WHERE z.reason='SIGNUP_BONUS_REFEREE' AND lower(z.wallet_address)=lower(q.wallet_address))=1)))
 ORDER BY l.id LIMIT least(greatest(coalesce(p_limit,500),1),1000)
$$;
REVOKE ALL ON FUNCTION public.vault_v2_source_rows_scan(uuid,uuid[],integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vault_v2_source_rows_scan(uuid,uuid[],integer) TO service_role;
COMMENT ON FUNCTION public.vault_v2_source_rows_scan(uuid,uuid[],integer) IS 'Deterministic keyset page of canonical funded post-cutover Vault V2 sources (id > p_after, ordered by id, at most 1000).';
CREATE FUNCTION public.vault_v2_source_summary() RETURNS TABLE(source_count bigint,source_points bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT count(*)::bigint,coalesce(sum(l.points),0)::bigint FROM flow_points_ledger l JOIN reward_award_destinations d ON d.ledger_id=l.id AND d.destination='VAULT_V2' JOIN profiles p ON p.id=l.user_id AND lower(p.wallet_address)=lower(l.wallet_address) JOIN auth.users u ON u.id=p.id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<now()) JOIN reward_reservations r ON r.reservation_id=l.reservation_id AND r.ledger_id=l.id AND r.user_id=l.user_id AND r.points=l.points AND r.program_id=l.program_id AND lower(r.wallet_address)=lower(l.wallet_address) JOIN reward_budgets b ON b.program_id=l.program_id AND b.status='ACTIVE' AND b.funding_verified AND b.reserved_points<=b.total_points JOIN reward_vault_v2_config c ON c.id AND c.cutover_accepted AND l.created_at>c.cutover_at
 WHERE l.points>0 AND l.funding_state='FUNDED' AND lower(l.wallet_address) ~ '^0x[0-9a-f]{40}$' AND lower(l.wallet_address)<>'0x0000000000000000000000000000000000000000' AND NOT EXISTS(SELECT 1 FROM reward_economic_award_allocations a WHERE a.ledger_id=l.id OR a.economic_award_id=d.economic_award_id)
 AND ((l.program_id='CORE_SWAP' AND l.policy_version='FLOW_POINTS_V2' AND l.chain_id=677 AND l.provenance_state='VERIFIED' AND l.verified_usd>=5 AND l.points<=floor(l.verified_usd) AND l.points<=1000 AND EXISTS(SELECT 1 FROM verified_activities v WHERE v.activity_id=l.verified_activity_id AND v.status='CONFIRMED' AND v.source_chain_id=677 AND lower(v.source_tx_hash)=lower(l.tx_hash) AND v.source_log_index=l.source_log_index AND lower(v.user_wallet)=lower(l.wallet_address))) OR (l.program_id='SIGNUP_BONUS' AND l.policy_version='FUNDED_SIGNUP_BONUS_V1' AND l.points=100 AND (l.chain_id IS NULL OR l.chain_id=677) AND l.reason IN ('SIGNUP_BONUS_REFEREE','REFERRAL_SIGNUP_BONUS') AND EXISTS(SELECT 1 FROM flow_points_ledger q JOIN profiles qp ON qp.id=q.user_id JOIN auth.users qu ON qu.id=q.user_id AND qu.email_confirmed_at IS NOT NULL AND (qu.banned_until IS NULL OR qu.banned_until<now()) WHERE q.reason='SIGNUP_BONUS_REFEREE' AND q.policy_version='FUNDED_SIGNUP_BONUS_V1' AND q.points=100 AND qp.created_at>='2026-10-04T01:00:00Z' AND lower(qp.wallet_address)=lower(q.wallet_address) AND q.user_id=CASE WHEN l.reason='SIGNUP_BONUS_REFEREE' THEN l.user_id ELSE (l.metadata->>'refereeId')::uuid END AND l.activity_key=CASE WHEN l.reason='SIGNUP_BONUS_REFEREE' THEN 'signup:'||q.user_id::text ELSE 'signup-ref:'||q.user_id::text END AND (SELECT count(*) FROM flow_points_ledger z WHERE z.reason='SIGNUP_BONUS_REFEREE' AND lower(z.wallet_address)=lower(q.wallet_address))=1)))
$$;
REVOKE ALL ON FUNCTION public.vault_v2_source_summary() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vault_v2_source_summary() TO service_role;
CREATE OR REPLACE FUNCTION public.vault_v2_source_rows() RETURNS TABLE(id uuid,economic_award_id text,wallet text,points integer,program_id text,destination text,created_at timestamptz,policy_version text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT s.id,s.economic_award_id,s.wallet,s.points,s.program_id,s.destination,s.created_at,s.policy_version FROM vault_v2_source_rows_scan(NULL,NULL,1000) s
$$;
COMMENT ON FUNCTION public.vault_v2_source_rows() IS 'DEPRECATED: first-1000 view only; replaced by vault_v2_source_rows_scan keyset pages and vault_v2_source_summary.';
CREATE OR REPLACE FUNCTION public.reserve_vault_v2_new_awards(p_batch text,p_ids uuid[],p_hash text,p_wallets text[],p_amounts text[],p_total numeric,p_evidence text,p_reconciliation jsonb,p_free numeric,p_observed timestamptz,p_block bigint,p_block_hash text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c reward_vault_v2_config; existing reward_vault_v2_batches; s record; wallets text[]; amounts text[]; total numeric; pending numeric; daily numeric;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('reward-destination-fence'));
 SELECT * INTO c FROM reward_vault_v2_config WHERE id FOR UPDATE;
 IF c IS NULL OR NOT c.financial_enabled OR NOT c.cutover_accepted OR NOT c.deployment_verified OR c.authorized_by IS NULL OR c.cutover_at IS NULL OR coalesce(c.code_hash,'') !~ '^0x[0-9a-f]{64}$' OR coalesce(c.contract_address,'') !~ '^0x[0-9a-f]{40}$' OR coalesce(c.publisher,'') !~ '^0x[0-9a-f]{40}$' OR c.batch_cap_wei<=0 OR c.daily_cap_wei<c.batch_cap_wei THEN RAISE EXCEPTION 'VAULT_V2_DISABLED_OR_UNAUTHORIZED'; END IF;
 SELECT * INTO existing FROM reward_vault_v2_batches WHERE batch_id=p_batch;
 IF FOUND THEN IF existing.source_ids=p_ids AND existing.snapshot_hash=p_hash AND existing.wallets=p_wallets AND existing.amounts_wei=p_amounts AND existing.total_wei=p_total THEN RETURN existing.batch_id; ELSE RAISE EXCEPTION 'immutable batch mismatch'; END IF; END IF;
 IF p_batch !~ '^0x[0-9a-f]{64}$' OR coalesce(cardinality(p_ids),0) NOT BETWEEN 1 AND 1000 OR cardinality(p_ids)<>(SELECT count(DISTINCT x) FROM unnest(p_ids) x) OR p_evidence IS DISTINCT FROM reward_payout_evidence_hash() OR p_hash IS DISTINCT FROM vault_v2_source_hash(p_ids) THEN RAISE EXCEPTION 'stale or malformed source snapshot'; END IF;
 IF p_observed IS NULL OR p_observed<now()-interval '30 seconds' OR p_observed>now()+interval '5 seconds' OR p_block IS NULL OR coalesce(p_block_hash,'') !~ '^0x[0-9a-f]{64}$' OR p_free IS NULL OR p_free<0 THEN RAISE EXCEPTION 'fresh canonical backing required'; END IF;
 PERFORM 1 FROM profiles WHERE id IN(SELECT user_id FROM flow_points_ledger WHERE id=ANY(p_ids)) ORDER BY id FOR SHARE;
 PERFORM 1 FROM reward_budgets ORDER BY program_id FOR SHARE;
 PERFORM 1 FROM auth.users WHERE id IN(SELECT user_id FROM flow_points_ledger WHERE id=ANY(p_ids)) ORDER BY id FOR SHARE;
 PERFORM 1 FROM reward_reservations WHERE ledger_id=ANY(p_ids) ORDER BY ledger_id FOR SHARE;
 PERFORM 1 FROM verified_activities WHERE activity_id IN(SELECT verified_activity_id FROM flow_points_ledger WHERE id=ANY(p_ids)) ORDER BY activity_id FOR SHARE;
 PERFORM 1 FROM flow_points_ledger WHERE id=ANY(p_ids) ORDER BY id FOR UPDATE;
 IF p_evidence IS DISTINCT FROM reward_payout_evidence_hash() OR p_hash IS DISTINCT FROM vault_v2_source_hash(p_ids) THEN RAISE EXCEPTION 'evidence changed while acquiring locks'; END IF;
 IF (SELECT count(*) FROM vault_v2_source_rows_scan(NULL,p_ids,1000))<>cardinality(p_ids) THEN RAISE EXCEPTION 'award funding provenance identity or destination invalid'; END IF;
 FOR s IN SELECT * FROM flow_points_ledger WHERE id=ANY(p_ids) LOOP
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_reconciliation) r WHERE r->>'userId'=s.user_id::text AND r->>'classification' IN ('MATCH','EXPLAINED_DIFFERENCE') AND r->'eligibleRowIds' ? s.id::text AND lower(r->>'wallet')=lower(s.wallet_address)) THEN RAISE EXCEPTION 'canonical account reconciliation missing'; END IF;
 END LOOP;
 SELECT array_agg(w ORDER BY w),array_agg(a::text ORDER BY w),sum(a) INTO wallets,amounts,total FROM (SELECT lower(wallet_address) w,sum(points)::numeric*1e18 a FROM flow_points_ledger WHERE id=ANY(p_ids) GROUP BY lower(wallet_address)) x;
 IF wallets IS DISTINCT FROM p_wallets OR amounts IS DISTINCT FROM p_amounts OR total IS DISTINCT FROM p_total OR cardinality(wallets)>100 THEN RAISE EXCEPTION 'exact wallet allocation mismatch'; END IF;
 SELECT coalesce(sum(total_wei),0) INTO pending FROM reward_vault_v2_batches WHERE state<>'CREDITED';
 SELECT coalesce(sum(total_wei),0) INTO daily FROM reward_vault_v2_batches WHERE created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
 IF total>c.batch_cap_wei OR total+daily>c.daily_cap_wei OR total+pending>p_free THEN RAISE EXCEPTION 'insufficient backing or authorized cap'; END IF;
 INSERT INTO reward_vault_v2_batches(batch_id,snapshot_hash,contract_address,publisher,source_ids,wallets,amounts_wei,total_wei) VALUES(p_batch,p_hash,c.contract_address,c.publisher,p_ids,wallets,amounts,total);
 INSERT INTO reward_economic_award_allocations(ledger_id,economic_award_id,user_id,wallet,program_id,points,destination,vault_batch_id) SELECT l.id,d.economic_award_id,l.user_id,lower(l.wallet_address),l.program_id,l.points,'VAULT_V2',p_batch FROM flow_points_ledger l JOIN reward_award_destinations d ON d.ledger_id=l.id WHERE l.id=ANY(p_ids);
 INSERT INTO admin_audit_events(actor_role,object_type,object_id,action,new_value) VALUES('system','reward_vault_v2',p_batch,'NEW_AWARDS_RESERVED',jsonb_build_object('sourceHash',p_hash,'sourceCount',cardinality(p_ids),'totalWei',total::text,'block',p_block,'blockHash',p_block_hash));
 RETURN p_batch;
END $$;
CREATE TABLE public.reward_vault_v2_hash_candidates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid NOT NULL REFERENCES public.reward_vault_v2_signing_attempts(operation_id), tx_hash text NOT NULL CHECK(tx_hash ~ '^0x[0-9a-f]{64}$'), source text NOT NULL CHECK(source IN ('WALLET_RETURNED','MANUAL','NONCE_SCAN')), recorded_by uuid NOT NULL, status text NOT NULL DEFAULT 'CANDIDATE' CHECK(status IN ('CANDIDATE','VERIFIED','REJECTED')), evidence jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(operation_id,tx_hash));
GRANT ALL ON public.reward_vault_v2_hash_candidates TO service_role;
ALTER TABLE public.reward_vault_v2_hash_candidates ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.reward_vault_v2_hash_candidates IS 'Append-only journal of unverified publisher transaction hashes; only an on-chain exact identity match becomes the authoritative signing tx_hash.';
CREATE FUNCTION public.record_vault_v2_hash_candidate(p_operation uuid,p_actor uuid,p_wallet text,p_hash text,p_source text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a reward_vault_v2_signing_attempts; cid uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('reward-destination-fence'));
 SELECT * INTO a FROM reward_vault_v2_signing_attempts WHERE operation_id=p_operation FOR UPDATE;
 IF a IS NULL OR a.publisher IS DISTINCT FROM p_wallet OR a.actor_user_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'signing operation owner mismatch'; END IF;
 IF a.phase IN ('CANCELLED','REVERTED','CREDITED') THEN RAISE EXCEPTION 'final operation immutable'; END IF;
 IF coalesce(p_hash,'') !~ '^0x[0-9a-f]{64}$' OR p_source NOT IN ('WALLET_RETURNED','MANUAL','NONCE_SCAN') THEN RAISE EXCEPTION 'malformed candidate'; END IF;
 SELECT id INTO cid FROM reward_vault_v2_hash_candidates WHERE operation_id=p_operation AND tx_hash=p_hash;
 IF cid IS NOT NULL THEN RETURN cid; END IF;
 IF (SELECT count(*) FROM reward_vault_v2_hash_candidates WHERE operation_id=p_operation)>=25 THEN RAISE EXCEPTION 'candidate limit reached; reconcile existing candidates'; END IF;
 INSERT INTO reward_vault_v2_hash_candidates(operation_id,tx_hash,source,recorded_by) VALUES(p_operation,p_hash,p_source,p_actor) RETURNING id INTO cid;
 IF a.phase='SIGNATURE' THEN UPDATE reward_vault_v2_signing_attempts SET phase='UNKNOWN',updated_at=now() WHERE operation_id=p_operation; END IF;
 INSERT INTO admin_audit_events(actor_user_id,actor_role,object_type,object_id,action,new_value) VALUES(p_actor,'publisher','reward_vault_v2',a.batch_id,'HASH_CANDIDATE_RECORDED',jsonb_build_object('operationId',p_operation,'hash',p_hash,'source',p_source));
 RETURN cid;
END $$;
REVOKE ALL ON FUNCTION public.record_vault_v2_hash_candidate(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_vault_v2_hash_candidate(uuid,uuid,text,text,text) TO service_role;
CREATE FUNCTION public.reject_vault_v2_hash_candidate(p_operation uuid,p_actor uuid,p_wallet text,p_hash text,p_evidence jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a reward_vault_v2_signing_attempts;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('reward-destination-fence'));
 SELECT * INTO a FROM reward_vault_v2_signing_attempts WHERE operation_id=p_operation FOR UPDATE;
 IF a IS NULL OR a.publisher IS DISTINCT FROM p_wallet OR a.actor_user_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'signing operation owner mismatch'; END IF;
 IF coalesce(p_evidence->>'verification','') NOT IN ('IDENTITY_MISMATCH','NONCE_CONFLICT_DIFFERENT_PAYLOAD') OR a.tx_hash IS NOT DISTINCT FROM p_hash THEN RAISE EXCEPTION 'candidate rejection requires visible mismatching transaction evidence'; END IF;
 UPDATE reward_vault_v2_hash_candidates SET status='REJECTED',evidence=p_evidence,updated_at=now() WHERE operation_id=p_operation AND tx_hash=p_hash AND status='CANDIDATE';
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO admin_audit_events(actor_user_id,actor_role,object_type,object_id,action,new_value) VALUES(p_actor,'publisher','reward_vault_v2',a.batch_id,'HASH_CANDIDATE_REJECTED',jsonb_build_object('operationId',p_operation,'hash',p_hash,'evidence',p_evidence));
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.reject_vault_v2_hash_candidate(uuid,uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reject_vault_v2_hash_candidate(uuid,uuid,text,text,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.transition_vault_v2_signing(p_operation uuid,p_actor uuid,p_wallet text,p_phase text,p_hash text,p_evidence jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a reward_vault_v2_signing_attempts;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('reward-destination-fence'));
 SELECT * INTO a FROM reward_vault_v2_signing_attempts WHERE operation_id=p_operation FOR UPDATE;
 IF a IS NULL OR a.publisher IS DISTINCT FROM p_wallet OR a.actor_user_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'signing operation owner mismatch'; END IF;
 IF a.phase IN ('CANCELLED','REVERTED','CREDITED') THEN IF a.phase=p_phase AND a.tx_hash IS NOT DISTINCT FROM p_hash THEN RETURN false; ELSE RAISE EXCEPTION 'final operation immutable'; END IF; END IF;
 IF p_phase NOT IN ('SUBMITTED','UNKNOWN','CANCELLED','REVERTED','CREDITED') THEN RAISE EXCEPTION 'invalid signing transition'; END IF;
 -- UNKNOWN never carries, replaces or clears an authoritative hash.
 IF p_phase='UNKNOWN' AND (p_hash IS NOT NULL OR a.tx_hash IS NOT NULL) THEN RAISE EXCEPTION 'unknown transition cannot touch an authoritative hash'; END IF;
 IF p_phase<>'UNKNOWN' AND a.tx_hash IS NOT NULL AND a.tx_hash IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'authoritative hash immutable'; END IF;
 -- Release only when the bound nonce is canonically consumed and the batch is not processed: the original can never be mined.
 IF p_phase='CANCELLED' AND (a.tx_hash IS NOT NULL OR p_hash IS NOT NULL OR coalesce(p_evidence->>'verification','')<>'CANONICAL_NONCE_CONSUMED_UNPROCESSED' OR p_evidence->>'nonce' IS DISTINCT FROM a.nonce::text OR coalesce(p_evidence->>'confirmedNonce','') !~ '^[0-9]+$' OR (p_evidence->>'confirmedNonce')::numeric<=a.nonce OR p_evidence->>'processedBatch' IS DISTINCT FROM 'false' OR coalesce(p_evidence->>'blockHash','') !~ '^0x[0-9a-f]{64}$') THEN RAISE EXCEPTION 'release requires canonical consumed-nonce evidence'; END IF;
 IF p_phase IN ('SUBMITTED','REVERTED','CREDITED') AND (p_hash IS NULL OR p_hash !~ '^0x[0-9a-f]{64}$') THEN RAISE EXCEPTION 'verified hash required'; END IF;
 IF p_phase='SUBMITTED' AND (coalesce(p_evidence->>'verification','')<>'EXACT_TRANSACTION_IDENTITY' OR p_evidence->>'nonce' IS DISTINCT FROM a.nonce::text OR NOT EXISTS(SELECT 1 FROM reward_vault_v2_hash_candidates WHERE operation_id=p_operation AND tx_hash=p_hash AND status IN ('CANDIDATE','VERIFIED'))) THEN RAISE EXCEPTION 'exact on-chain identity of a journaled candidate required'; END IF;
 IF p_phase IN ('REVERTED','CREDITED') AND a.tx_hash IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'verified submission required first'; END IF;
 IF p_phase='REVERTED' AND coalesce(p_evidence->>'verification','')<>'EXACT_CANONICAL_REVERT' THEN RAISE EXCEPTION 'exact revert required'; END IF;
 IF p_phase='CREDITED' AND NOT EXISTS(SELECT 1 FROM reward_vault_v2_batches WHERE batch_id=a.batch_id AND state='CREDITED' AND tx_hash=p_hash) THEN RAISE EXCEPTION 'credit not committed'; END IF;
 UPDATE reward_vault_v2_signing_attempts SET phase=p_phase,tx_hash=CASE WHEN p_phase='UNKNOWN' THEN a.tx_hash ELSE p_hash END,evidence=p_evidence,updated_at=now() WHERE operation_id=p_operation;
 IF p_phase='SUBMITTED' THEN UPDATE reward_vault_v2_hash_candidates SET status='VERIFIED',evidence=p_evidence,updated_at=now() WHERE operation_id=p_operation AND tx_hash=p_hash; END IF;
 INSERT INTO admin_audit_events(actor_user_id,actor_role,object_type,object_id,action,new_value) VALUES(p_actor,'publisher','reward_vault_v2',a.batch_id,'SIGNING_'||p_phase,jsonb_build_object('operationId',p_operation,'hash',p_hash,'evidence',p_evidence));
 RETURN true;
END $$;