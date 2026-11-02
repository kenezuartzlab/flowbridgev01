CREATE FUNCTION public.reserve_vault_v2_new_awards(p_batch text,p_ids uuid[],p_hash text,p_wallets text[],p_amounts text[],p_total numeric,p_evidence text,p_reconciliation jsonb,p_free numeric,p_observed timestamptz,p_block bigint,p_block_hash text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
 IF (SELECT count(*) FROM vault_v2_source_rows() WHERE id=ANY(p_ids))<>cardinality(p_ids) THEN RAISE EXCEPTION 'award funding provenance identity or destination invalid'; END IF;
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
REVOKE ALL ON FUNCTION public.reserve_vault_v2_new_awards(text,uuid[],text,text[],text[],numeric,text,jsonb,numeric,timestamptz,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_vault_v2_new_awards(text,uuid[],text,text[],text[],numeric,text,jsonb,numeric,timestamptz,bigint,text) TO service_role;
CREATE TABLE public.reward_vault_v2_credit_evidence(batch_id text PRIMARY KEY REFERENCES public.reward_vault_v2_batches(batch_id),tx_hash text NOT NULL UNIQUE,block_number bigint NOT NULL,block_hash text NOT NULL,head_number bigint NOT NULL,evidence jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.reward_vault_v2_credit_evidence TO service_role;
ALTER TABLE public.reward_vault_v2_credit_evidence ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.confirm_vault_v2_credit(p_batch text,p_hash text,p_snapshot text,p_block bigint,p_block_hash text,p_head bigint,p_evidence jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b reward_vault_v2_batches; c reward_vault_v2_config;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('reward-destination-fence'));
 SELECT * INTO c FROM reward_vault_v2_config WHERE id;
 SELECT * INTO b FROM reward_vault_v2_batches WHERE batch_id=p_batch FOR UPDATE;
 IF c IS NULL OR NOT c.deployment_verified OR b IS NULL OR b.contract_address IS DISTINCT FROM c.contract_address OR b.snapshot_hash IS DISTINCT FROM p_snapshot OR coalesce(p_hash,'') !~ '^0x[0-9a-f]{64}$' OR p_head IS NULL OR p_block IS NULL OR p_head-p_block<2 OR coalesce(p_block_hash,'') !~ '^0x[0-9a-f]{64}$' OR coalesce(p_evidence->>'verification','')<>'EXACT_CANONICAL_CREDIT' THEN RAISE EXCEPTION 'exact confirmed credit evidence required'; END IF;
 IF b.state='CREDITED' THEN IF b.tx_hash=p_hash AND b.receipt_block_hash=p_block_hash THEN RETURN false; ELSE RAISE EXCEPTION 'conflicting confirmation'; END IF; END IF;
 IF b.tx_hash IS NOT NULL AND b.tx_hash<>p_hash THEN RAISE EXCEPTION 'transaction already attached'; END IF;
 IF (SELECT count(*) FROM reward_economic_award_allocations WHERE vault_batch_id=p_batch AND destination='VAULT_V2')<>cardinality(b.source_ids) THEN RAISE EXCEPTION 'source allocation missing'; END IF;
 INSERT INTO reward_vault_v2_credit_evidence VALUES(p_batch,p_hash,p_block,p_block_hash,p_head,p_evidence,now());
 UPDATE reward_vault_v2_batches SET state='CREDITED',tx_hash=p_hash,receipt_block=p_block,receipt_block_hash=p_block_hash WHERE batch_id=p_batch;
 INSERT INTO admin_audit_events(actor_role,object_type,object_id,action,new_value) VALUES('system','reward_vault_v2',p_batch,'ONCHAIN_CREDIT_VERIFIED',p_evidence);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.confirm_vault_v2_credit(text,text,text,bigint,text,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_vault_v2_credit(text,text,text,bigint,text,bigint,jsonb) TO service_role;
CREATE FUNCTION public.guard_vault_source_identity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM reward_award_destinations WHERE ledger_id=OLD.id) THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'routed reward cannot be deleted'; END IF;
  IF (to_jsonb(NEW)-ARRAY['funding_state','reservation_id','provenance_state']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['funding_state','reservation_id','provenance_state']) THEN RAISE EXCEPTION 'routed economic identity immutable'; END IF;
  IF EXISTS(SELECT 1 FROM reward_economic_award_allocations WHERE ledger_id=OLD.id) AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'reserved source immutable'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER vault_source_identity BEFORE UPDATE OR DELETE ON public.flow_points_ledger FOR EACH ROW EXECUTE FUNCTION public.guard_vault_source_identity();
CREATE OR REPLACE FUNCTION public.guard_vault_v2_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF TG_OP='DELETE' OR TG_TABLE_NAME IN ('reward_economic_award_allocations','reward_award_destinations','reward_vault_v2_credit_evidence') THEN RAISE EXCEPTION 'Vault allocation history is immutable'; END IF;
 IF (to_jsonb(NEW)-ARRAY['state','tx_hash','receipt_block','receipt_block_hash']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','tx_hash','receipt_block','receipt_block_hash']) THEN RAISE EXCEPTION 'Batch snapshot is immutable'; END IF;
 IF OLD.tx_hash IS NOT NULL AND NEW.tx_hash IS DISTINCT FROM OLD.tx_hash THEN RAISE EXCEPTION 'Submitted transaction identity is immutable'; END IF;
 IF OLD.state='CREDITED' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Credited batch is immutable'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER reward_destination_immutable BEFORE UPDATE OR DELETE ON public.reward_award_destinations FOR EACH ROW EXECUTE FUNCTION public.guard_vault_v2_snapshot();
CREATE TRIGGER vault_credit_evidence_immutable BEFORE UPDATE OR DELETE ON public.reward_vault_v2_credit_evidence FOR EACH ROW EXECUTE FUNCTION public.guard_vault_v2_snapshot();
CREATE FUNCTION public.authorize_vault_v2_cutover(p_actor uuid,p_wallet text,p_cutover timestamptz,p_contract text,p_code text,p_publisher text,p_batch_cap numeric,p_daily_cap numeric,p_evidence jsonb,p_state_hash text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c reward_vault_v2_config; email text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('reward-destination-fence'));
 SELECT p.email INTO email FROM profiles p JOIN app_admins a ON lower(a.email)=lower(p.email) JOIN auth.users u ON u.id=p.id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<now()) WHERE p.id=p_actor AND lower(p.wallet_address)=lower(p_wallet) AND a.role='super_admin' AND NOT coalesce(a.disabled,false);
 IF email IS NULL THEN RAISE EXCEPTION 'authorized bound super admin required'; END IF;
 SELECT * INTO c FROM reward_vault_v2_config WHERE id FOR UPDATE;
 IF c.cutover_accepted THEN RAISE EXCEPTION 'cutover is immutable'; END IF;
 IF p_cutover IS NULL OR p_cutover<=now() OR p_state_hash IS DISTINCT FROM reward_payout_evidence_hash() OR coalesce(p_contract,'') !~ '^0x[0-9a-f]{40}$' OR p_contract='0x0000000000000000000000000000000000000000' OR coalesce(p_code,'') !~ '^0x[0-9a-f]{64}$' OR coalesce(p_publisher,'') !~ '^0x[0-9a-f]{40}$' OR p_publisher=lower(p_wallet) OR p_batch_cap IS NULL OR p_batch_cap<=0 OR p_daily_cap IS NULL OR p_daily_cap<p_batch_cap THEN RAISE EXCEPTION 'future cutover and verified authorized deployment required'; END IF;
 IF coalesce(p_evidence->>'verification','')<>'VERIFIED_MAINNET_DEPLOYMENT' OR p_evidence->>'codeHash' IS DISTINCT FROM p_code OR p_evidence->>'contract' IS DISTINCT FROM p_contract OR p_evidence->>'publisher' IS DISTINCT FROM p_publisher OR coalesce(p_evidence->>'chainId','')<>'677' OR coalesce((p_evidence->>'freeWei')::numeric,0)<=0 OR (p_evidence->>'batchCapWei')::numeric IS DISTINCT FROM p_batch_cap OR (p_evidence->>'dailyCapWei')::numeric IS DISTINCT FROM p_daily_cap THEN RAISE EXCEPTION 'canonical deployment evidence required'; END IF;
 IF EXISTS(SELECT 1 FROM reward_publish_attempts WHERE phase<>'CONFIRMED_VERIFIED' AND NOT retry_safe) THEN RAISE EXCEPTION 'unresolved legacy publication'; END IF;
 INSERT INTO reward_vault_v2_config(id,financial_enabled,cutover_accepted,authorized_by,publisher,batch_cap_wei,daily_cap_wei,deployment_verified,contract_address,code_hash,cutover_at,cutover_evidence) VALUES(true,true,true,p_actor,p_publisher,p_batch_cap,p_daily_cap,true,p_contract,p_code,p_cutover,p_evidence) ON CONFLICT(id) DO UPDATE SET financial_enabled=true,cutover_accepted=true,authorized_by=p_actor,publisher=p_publisher,batch_cap_wei=p_batch_cap,daily_cap_wei=p_daily_cap,deployment_verified=true,contract_address=p_contract,code_hash=p_code,cutover_at=p_cutover,cutover_evidence=p_evidence;
 INSERT INTO admin_audit_events(actor_user_id,actor_email,actor_role,object_type,object_id,action,new_value) VALUES(p_actor,email,'super_admin','reward_vault_v2','cutover','FUTURE_NEW_AWARDS_CUTOVER_AUTHORIZED',jsonb_build_object('cutoverAt',p_cutover,'evidence',p_evidence,'legacyStateHash',p_state_hash));
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.authorize_vault_v2_cutover(uuid,text,timestamptz,text,text,text,numeric,numeric,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_vault_v2_cutover(uuid,text,timestamptz,text,text,text,numeric,numeric,jsonb,text) TO service_role;
CREATE FUNCTION public.guard_vault_cutover_config() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' AND OLD.cutover_accepted THEN RAISE EXCEPTION 'cutover history immutable'; END IF;
 IF TG_OP='UPDATE' AND OLD.cutover_accepted AND (to_jsonb(NEW)-ARRAY['financial_enabled','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['financial_enabled','updated_at']) THEN RAISE EXCEPTION 'accepted cutover identity immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER vault_cutover_immutable BEFORE UPDATE OR DELETE ON public.reward_vault_v2_config FOR EACH ROW EXECUTE FUNCTION public.guard_vault_cutover_config();
REVOKE ALL ON FUNCTION public.guard_vault_source_identity() FROM PUBLIC,anon,authenticated;