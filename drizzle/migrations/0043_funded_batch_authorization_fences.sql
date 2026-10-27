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
 IF b IS NOT NULL THEN
  IF b.root=p_root THEN RETURN b.id; END IF;
  RAISE EXCEPTION 'active batch already exists; revalidate it rather than overlap';
 END IF;
 IF EXISTS(SELECT 1 FROM reward_settlement_batches WHERE chain_id=677 AND epoch_id=p_epoch AND root=p_root) THEN RAISE EXCEPTION 'retired root cannot be reused'; END IF;
 INSERT INTO reward_settlement_batches(chain_id,distributor,epoch_id,root,total_wei,claim_start,claim_end,fingerprint,leaves,program_breakdown) VALUES(677,'0x7b805b036b22e2b71ef5e8f7ea21d8791819b922',p_epoch,p_root,p_total,p_start,p_end,p_fingerprint,p_leaves,p_programs) RETURNING id INTO new_id;
 INSERT INTO admin_audit_events(actor_role,object_type,object_id,action,new_value) VALUES('system','reward_round','677:'||p_epoch,'FUNDED_BATCH_PREPARED',jsonb_build_object('batchId',new_id,'root',p_root,'totalWei',p_total::text));
 RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION public.persist_funded_reward_batch(integer,text,numeric,bigint,bigint,text,jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.persist_funded_reward_batch(integer,text,numeric,bigint,bigint,text,jsonb,jsonb,text) TO service_role;
CREATE OR REPLACE FUNCTION public.refresh_funded_batch_schedule(p_batch uuid,p_start bigint,p_end bigint,p_fingerprint text,p_now bigint,p_delay bigint,p_evidence text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b reward_settlement_batches; leaf jsonb; old_start bigint; c reward_auto_approval_config;
BEGIN
 SELECT * INTO b FROM reward_settlement_batches WHERE id=p_batch FOR UPDATE;
 SELECT * INTO c FROM reward_auto_approval_config WHERE id=1;
 IF c IS NULL OR NOT c.enabled OR c.suspended OR c.policy_revision<>2 OR NOT c.acceptance_confirmed THEN RETURN false; END IF;
 IF b IS NULL OR b.epoch_id<4 OR b.publication_verified_at IS NOT NULL OR EXISTS(SELECT 1 FROM reward_retired_drafts WHERE batch_id=b.id) OR EXISTS(SELECT 1 FROM reward_publish_attempts WHERE batch_id=b.id) THEN RETURN false; END IF;
 IF p_evidence IS DISTINCT FROM reward_payout_evidence_hash() OR p_delay<86400 OR abs(extract(epoch FROM now())-p_now)>120 OR p_start<p_now+p_delay OR p_end-p_start<>2592000 THEN RAISE EXCEPTION 'current safe timing and funding evidence required'; END IF;
 SELECT claim_start INTO old_start FROM reward_schedule_renewals WHERE batch_id=b.id AND status='APPROVED';
 IF coalesce(old_start,b.claim_start)>=p_now+p_delay THEN RETURN false; END IF;
 FOR leaf IN SELECT * FROM jsonb_array_elements(b.leaves) LOOP
  IF NOT EXISTS(SELECT 1 FROM reward_payout_approvals a WHERE a.status='CONFIRMED' AND a.settlement_batch_id IS NULL AND a.confirmed_at<=b.created_at AND lower(a.wallet)=lower(leaf->>'account') AND a.points::numeric*1000000000000000000=(leaf->>'amount')::numeric) THEN RAISE EXCEPTION 'unapproved historical allocation cannot inherit policy'; END IF;
 END LOOP;
 UPDATE reward_schedule_renewals SET status='SUPERSEDED' WHERE batch_id=b.id AND status='APPROVED';
 INSERT INTO reward_schedule_renewals(batch_id,original_fingerprint,previous_fingerprint,fingerprint,claim_start,claim_end,min_publish_delay,evidence_hash,status,proposed_by,approved_by,approved_at) VALUES(b.id,b.fingerprint,b.fingerprint,p_fingerprint,p_start,p_end,p_delay,p_evidence,'APPROVED',c.updated_by,c.updated_by,now());
 INSERT INTO admin_audit_events(actor_user_id,actor_role,object_type,object_id,action,new_value,reason) VALUES(c.updated_by,'automation','reward_round','677:'||b.epoch_id,'FUNDED_POLICY_SCHEDULE_REFRESH',jsonb_build_object('batchId',b.id,'claimStart',p_start,'claimEnd',p_end,'fingerprint',p_fingerprint),'Schedule-only under explicit master policy; unchanged confirmed allocations, publisher still signs');
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.refresh_funded_batch_schedule(uuid,bigint,bigint,text,bigint,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_funded_batch_schedule(uuid,bigint,bigint,text,bigint,bigint,text) TO service_role;
CREATE OR REPLACE FUNCTION public.block_retired_reward_publication() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE b reward_settlement_batches; leaf jsonb;
BEGIN
 SELECT * INTO b FROM reward_settlement_batches WHERE id=NEW.batch_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM reward_retired_drafts WHERE batch_id=NEW.batch_id) THEN RAISE EXCEPTION 'retired unapproved draft cannot be published'; END IF;
 IF b.epoch_id>=4 AND b.publication_verified_at IS NULL THEN
  FOR leaf IN SELECT * FROM jsonb_array_elements(b.leaves) LOOP
   IF NOT EXISTS(SELECT 1 FROM reward_payout_approvals a JOIN profiles p ON p.id=a.user_id AND lower(p.wallet_address)=lower(a.wallet) WHERE a.status='CONFIRMED' AND a.settlement_batch_id IS NULL AND a.confirmed_at<=b.created_at AND lower(a.wallet)=lower(leaf->>'account') AND a.points::numeric*1000000000000000000=(leaf->>'amount')::numeric) THEN RAISE EXCEPTION 'exact unpaid approval predating batch required'; END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;