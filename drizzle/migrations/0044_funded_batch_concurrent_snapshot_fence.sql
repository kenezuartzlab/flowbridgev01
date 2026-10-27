CREATE OR REPLACE FUNCTION public.persist_funded_reward_batch(p_epoch integer,p_root text,p_total numeric,p_start bigint,p_end bigint,p_fingerprint text,p_leaves jsonb,p_programs jsonb,p_evidence text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b reward_settlement_batches; leaf jsonb; a reward_payout_approvals; new_id uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('funded-reward-batch:'||p_epoch));
 IF p_epoch<4 OR p_evidence IS DISTINCT FROM reward_payout_evidence_hash() OR p_root !~ '^0x[0-9a-f]{64}$' OR p_start<extract(epoch FROM now())+86400 OR p_end-p_start<>2592000 OR p_total<=0 OR p_total>250000000000000000000000 OR jsonb_array_length(p_leaves)>200 OR jsonb_array_length(p_leaves)<1 THEN RAISE EXCEPTION 'invalid funded batch snapshot'; END IF;
 FOR leaf IN SELECT * FROM jsonb_array_elements(p_leaves) LOOP
  SELECT * INTO a FROM reward_payout_approvals WHERE lower(wallet)=lower(leaf->>'account') AND status='CONFIRMED' AND settlement_batch_id IS NULL FOR SHARE;
  IF a IS NULL OR (leaf->>'amount')::numeric<>a.points::numeric*1000000000000000000 THEN RAISE EXCEPTION 'exact confirmed unpaid authorization required for every leaf'; END IF;
 END LOOP;
 SELECT x.* INTO b FROM reward_settlement_batches x WHERE x.chain_id=677 AND x.distributor='0x7b805b036b22e2b71ef5e8f7ea21d8791819b922' AND x.epoch_id=p_epoch AND NOT EXISTS(SELECT 1 FROM reward_retired_drafts r WHERE r.batch_id=x.id) FOR UPDATE;
 IF FOUND THEN
  IF b.root=p_root THEN RETURN b.id; END IF;
  RAISE EXCEPTION 'active batch already exists; revalidate it rather than overlap';
 END IF;
 IF EXISTS(SELECT 1 FROM reward_settlement_batches WHERE chain_id=677 AND epoch_id=p_epoch AND root=p_root) THEN RAISE EXCEPTION 'retired root cannot be reused'; END IF;
 INSERT INTO reward_settlement_batches(chain_id,distributor,epoch_id,root,total_wei,claim_start,claim_end,fingerprint,leaves,program_breakdown) VALUES(677,'0x7b805b036b22e2b71ef5e8f7ea21d8791819b922',p_epoch,p_root,p_total,p_start,p_end,p_fingerprint,p_leaves,p_programs) RETURNING id INTO new_id;
 INSERT INTO admin_audit_events(actor_role,object_type,object_id,action,new_value) VALUES('system','reward_round','677:'||p_epoch,'FUNDED_BATCH_PREPARED',jsonb_build_object('batchId',new_id,'root',p_root,'totalWei',p_total::text));
 RETURN new_id;
END $$;