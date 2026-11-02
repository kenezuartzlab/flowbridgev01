CREATE OR REPLACE FUNCTION public.guard_legacy_reward_destination() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c reward_vault_v2_config; w text; funded numeric; settled numeric; required numeric; outstanding numeric; leaf jsonb;
BEGIN
 SELECT * INTO c FROM reward_vault_v2_config WHERE id=true;
 IF c IS NULL OR NOT c.cutover_accepted THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='reward_publish_attempts' THEN
 IF EXISTS(SELECT 1 FROM reward_settlement_batches WHERE id=NEW.batch_id AND created_at<=c.cutover_at) THEN RETURN NEW; END IF;
 END IF;
 IF TG_TABLE_NAME<>'reward_publish_attempts' AND (to_jsonb(NEW)->>'created_at')::timestamptz<=c.cutover_at THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('reward-destination-fence'));
 IF TG_TABLE_NAME='reward_payout_approvals' THEN
  IF NEW.status NOT IN ('PROPOSED','APPROVED','CONFIRMED') OR (TG_OP='UPDATE' AND NEW.settlement_batch_id IS NOT NULL) THEN RETURN NEW; END IF;
  w:=lower(NEW.wallet);required:=NEW.points;
  SELECT coalesce(sum((x->>'amount')::numeric/1e18),0) INTO settled FROM reward_settlement_batches b CROSS JOIN LATERAL jsonb_array_elements(b.leaves) x WHERE b.chain_id=677 AND b.publication_verified_at IS NOT NULL AND lower(x->>'account')=w;
  SELECT coalesce(sum(l.points),0) INTO funded FROM flow_points_ledger l JOIN reward_reservations r ON r.ledger_id=l.id AND r.reservation_id=l.reservation_id AND r.points=l.points AND r.user_id=l.user_id AND r.program_id=l.program_id AND lower(r.wallet_address)=lower(l.wallet_address) JOIN reward_budgets b ON b.program_id=l.program_id AND b.funding_verified AND b.status='ACTIVE' AND b.reserved_points<=b.total_points WHERE lower(l.wallet_address)=w AND l.funding_state='FUNDED' AND l.points>0 AND NOT EXISTS(SELECT 1 FROM reward_award_destinations d WHERE d.ledger_id=l.id AND d.destination='VAULT_V2');
  SELECT coalesce(sum(points),0) INTO outstanding FROM reward_payout_approvals WHERE lower(wallet)=w AND status IN ('PROPOSED','APPROVED','CONFIRMED') AND settlement_batch_id IS NULL AND id IS DISTINCT FROM NEW.id;
  IF required+outstanding>funded-settled THEN RAISE EXCEPTION 'V1 amount includes V2-fenced awards'; END IF;
 ELSE
  IF TG_TABLE_NAME='reward_publish_attempts' THEN SELECT leaves INTO leaf FROM reward_settlement_batches WHERE id=NEW.batch_id; ELSE leaf:=NEW.leaves; END IF;
  FOR w,required IN SELECT lower(x->>'account'),(x->>'amount')::numeric/1e18 FROM jsonb_array_elements(leaf) x LOOP
   SELECT coalesce(sum(l.points),0) INTO funded FROM flow_points_ledger l JOIN reward_reservations r ON r.ledger_id=l.id AND r.reservation_id=l.reservation_id AND r.points=l.points AND r.user_id=l.user_id AND r.program_id=l.program_id AND lower(r.wallet_address)=lower(l.wallet_address) JOIN reward_budgets b ON b.program_id=l.program_id AND b.funding_verified AND b.status='ACTIVE' AND b.reserved_points<=b.total_points WHERE lower(l.wallet_address)=w AND l.funding_state='FUNDED' AND l.points>0 AND NOT EXISTS(SELECT 1 FROM reward_award_destinations d WHERE d.ledger_id=l.id AND d.destination='VAULT_V2');
   SELECT coalesce(sum((x->>'amount')::numeric/1e18),0) INTO settled FROM reward_settlement_batches b CROSS JOIN LATERAL jsonb_array_elements(b.leaves) x WHERE b.chain_id=677 AND b.publication_verified_at IS NOT NULL AND lower(x->>'account')=w AND b.id IS DISTINCT FROM CASE WHEN TG_TABLE_NAME='reward_publish_attempts' THEN (to_jsonb(NEW)->>'batch_id')::uuid ELSE (to_jsonb(NEW)->>'id')::uuid END;
   SELECT coalesce(sum((x->>'amount')::numeric/1e18),0) INTO outstanding FROM reward_settlement_batches b CROSS JOIN LATERAL jsonb_array_elements(b.leaves) x WHERE b.chain_id=677 AND b.publication_verified_at IS NULL AND NOT EXISTS(SELECT 1 FROM reward_retired_drafts r WHERE r.batch_id=b.id) AND lower(x->>'account')=w AND b.id IS DISTINCT FROM CASE WHEN TG_TABLE_NAME='reward_publish_attempts' THEN (to_jsonb(NEW)->>'batch_id')::uuid ELSE (to_jsonb(NEW)->>'id')::uuid END;
   IF required+outstanding>funded-settled THEN RAISE EXCEPTION 'V1 batch includes V2-fenced awards'; END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.confirm_vault_v2_credit(p_batch text,p_hash text,p_snapshot text,p_block bigint,p_block_hash text,p_head bigint,p_evidence jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b reward_vault_v2_batches; c reward_vault_v2_config;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('reward-destination-fence'));
 SELECT * INTO c FROM reward_vault_v2_config WHERE id;
 SELECT * INTO b FROM reward_vault_v2_batches WHERE batch_id=p_batch FOR UPDATE;
 IF c IS NULL OR NOT c.deployment_verified OR b IS NULL OR b.contract_address IS DISTINCT FROM c.contract_address OR b.snapshot_hash IS DISTINCT FROM p_snapshot OR coalesce(p_hash,'') !~ '^0x[0-9a-f]{64}$' OR p_head IS NULL OR p_block IS NULL OR p_head-p_block<2 OR coalesce(p_block_hash,'') !~ '^0x[0-9a-f]{64}$' OR coalesce(p_evidence->>'verification','')<>'EXACT_CANONICAL_CREDIT' THEN RAISE EXCEPTION 'exact confirmed credit evidence required'; END IF;
 IF p_evidence->>'transactionHash' IS DISTINCT FROM p_hash OR p_evidence->>'snapshotHash' IS DISTINCT FROM b.snapshot_hash OR p_evidence->>'contract' IS DISTINCT FROM b.contract_address OR p_evidence->>'publisher' IS DISTINCT FROM b.publisher OR p_evidence->>'codeHash' IS DISTINCT FROM c.code_hash OR p_evidence->>'chainId' IS DISTINCT FROM '677' OR p_evidence->>'blockHash' IS DISTINCT FROM p_block_hash OR p_evidence->>'blockNumber' IS DISTINCT FROM p_block::text OR p_evidence->>'headNumber' IS DISTINCT FROM p_head::text OR p_evidence->'sourceIds' IS DISTINCT FROM to_jsonb(b.source_ids) OR jsonb_typeof(p_evidence->'logs') IS DISTINCT FROM 'array' OR jsonb_array_length(p_evidence->'logs')<>cardinality(b.wallets)+1 THEN RAISE EXCEPTION 'receipt evidence does not bind stored batch'; END IF;
 IF b.state='CREDITED' THEN IF b.tx_hash=p_hash AND b.receipt_block_hash=p_block_hash THEN RETURN false; ELSE RAISE EXCEPTION 'conflicting confirmation'; END IF; END IF;
 IF b.tx_hash IS NOT NULL AND b.tx_hash<>p_hash THEN RAISE EXCEPTION 'transaction already attached'; END IF;
 IF (SELECT count(*) FROM reward_economic_award_allocations WHERE vault_batch_id=p_batch AND destination='VAULT_V2')<>cardinality(b.source_ids) THEN RAISE EXCEPTION 'source allocation missing'; END IF;
 INSERT INTO reward_vault_v2_credit_evidence VALUES(p_batch,p_hash,p_block,p_block_hash,p_head,p_evidence,now());
 UPDATE reward_vault_v2_batches SET state='CREDITED',tx_hash=p_hash,receipt_block=p_block,receipt_block_hash=p_block_hash WHERE batch_id=p_batch;
 INSERT INTO admin_audit_events(actor_role,object_type,object_id,action,new_value) VALUES('system','reward_vault_v2',p_batch,'ONCHAIN_CREDIT_VERIFIED',p_evidence);
 RETURN true;
END $$;
CREATE TRIGGER legacy_batch_update_destination BEFORE UPDATE ON public.reward_settlement_batches FOR EACH ROW WHEN (OLD.leaves IS DISTINCT FROM NEW.leaves OR OLD.total_wei IS DISTINCT FROM NEW.total_wei) EXECUTE FUNCTION public.guard_legacy_reward_destination();