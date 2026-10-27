ALTER TABLE public.reward_auto_approval_config ADD COLUMN IF NOT EXISTS policy_revision integer NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.reward_auto_approval_config.daily_budget_flow IS 'DEPRECATED for policy revision 2: uses existing authorized funding, campaign and 500000 FLOW rolling-day limits';
COMMENT ON COLUMN public.reward_auto_approval_config.enabled_programs IS 'DEPRECATED for policy revision 2: uses existing active funding-verified program budgets';
COMMENT ON COLUMN public.reward_auto_approval_config.per_wallet_daily_cap IS 'DEPRECATED for policy revision 2: existing earning and payout safeguards remain authoritative';
CREATE TABLE public.reward_retired_drafts (batch_id uuid PRIMARY KEY REFERENCES public.reward_settlement_batches(id), retired_at timestamptz NOT NULL DEFAULT now(), reason text NOT NULL, evidence_hash text NOT NULL);
GRANT ALL ON public.reward_retired_drafts TO service_role;
ALTER TABLE public.reward_retired_drafts ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.retire_unapproved_reward_draft(p_batch uuid,p_now bigint,p_delay bigint,p_epoch integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b reward_settlement_batches;
BEGIN
 SELECT * INTO b FROM reward_settlement_batches WHERE id=p_batch FOR UPDATE;
 IF EXISTS(SELECT 1 FROM reward_retired_drafts WHERE batch_id=p_batch) THEN RETURN false; END IF;
 IF b IS NULL OR b.chain_id<>677 OR b.epoch_id<>4 OR p_epoch<>3 OR b.publication_verified_at IS NOT NULL OR b.total_wei<>1190000000000000000000 OR jsonb_array_length(b.leaves)<>12 OR b.root<>'0xe2af18b23c702ddf6d0bd32e717ca4f8a997deb0dbf4f3df508096d8be2065a5' OR p_delay<86400 OR b.claim_start>=p_now+p_delay OR abs(extract(epoch FROM now())-p_now)>120 THEN RAISE EXCEPTION 'exact expired unpublished historical draft required'; END IF;
 IF EXISTS(SELECT 1 FROM reward_publish_attempts WHERE batch_id=b.id) OR EXISTS(SELECT 1 FROM reward_schedule_renewals WHERE batch_id=b.id AND status='APPROVED') OR EXISTS(SELECT 1 FROM reward_payout_approvals WHERE settlement_batch_id=b.id OR (status='CONFIRMED' AND confirmed_at<=b.created_at AND lower(wallet) IN (SELECT lower(x->>'account') FROM jsonb_array_elements(b.leaves) x))) THEN RAISE EXCEPTION 'authorization or publication uncertainty blocks retirement'; END IF;
 INSERT INTO reward_retired_drafts(batch_id,reason,evidence_hash) VALUES(b.id,'Owner-authorized retirement of expired unapproved historical draft; no rewards, reservations, approvals or on-chain state modified',reward_payout_evidence_hash());
 INSERT INTO admin_audit_events(actor_role,object_type,object_id,action,new_value,reason) VALUES('system','reward_round','677:4','UNAPPROVED_DRAFT_RETIRED',jsonb_build_object('batchId',b.id,'root',b.root,'totalWei',b.total_wei::text,'wallets',12),'Owner direction Oct 27: preserve history; rebuild only from fresh legitimate authorizations');
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.retire_unapproved_reward_draft(uuid,bigint,bigint,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retire_unapproved_reward_draft(uuid,bigint,bigint,integer) TO service_role;
CREATE OR REPLACE FUNCTION public.block_retired_reward_publication() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM reward_settlement_batches WHERE id=NEW.batch_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM reward_retired_drafts WHERE batch_id=NEW.batch_id) THEN RAISE EXCEPTION 'retired unapproved draft cannot be published'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER block_retired_reward_publication BEFORE INSERT OR UPDATE ON public.reward_publish_attempts FOR EACH ROW EXECUTE FUNCTION public.block_retired_reward_publication();
CREATE OR REPLACE FUNCTION public.set_funded_reward_automation(p_actor uuid,p_wallet text,p_enabled boolean,p_suspended boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_config reward_auto_approval_config; actor_email text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('reward_auto_approval'));
 SELECT p.email INTO actor_email FROM profiles p JOIN app_admins a ON lower(a.email)=lower(p.email) WHERE p.id=p_actor AND lower(p.wallet_address)=lower(p_wallet) AND a.role='super_admin' AND NOT coalesce(a.disabled,false);
 IF actor_email IS NULL THEN RAISE EXCEPTION 'authorized bound super admin required'; END IF;
 SELECT * INTO old_config FROM reward_auto_approval_config WHERE id=1 FOR UPDATE;
 UPDATE reward_auto_approval_config SET enabled=p_enabled,suspended=p_suspended,acceptance_confirmed=p_enabled,policy_revision=2,updated_by=p_actor,updated_by_email=actor_email,updated_at=now() WHERE id=1;
 INSERT INTO admin_audit_events(actor_user_id,actor_email,actor_role,object_type,object_id,action,old_value,new_value) VALUES(p_actor,actor_email,'super_admin','reward_automation','auto-approval','FUNDED_LIMITS_POLICY_SWITCH',to_jsonb(old_config),jsonb_build_object('enabled',p_enabled,'suspended',p_suspended,'policyRevision',2));
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.set_funded_reward_automation(uuid,text,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_funded_reward_automation(uuid,text,boolean,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.auto_approve_funded_payout(p_user uuid,p_wallet text,p_points integer,p_available integer,p_funded integer,p_settled integer,p_programs jsonb,p_evidence jsonb,p_hash text,p_backing bigint,p_observed timestamptz,p_state_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c reward_auto_approval_config; used bigint; pending bigint; wallets integer; new_id uuid; k text; v jsonb; total bigint:=0; actual_funded bigint; actual_settled bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('reward_auto_approval'));
 SELECT * INTO c FROM reward_auto_approval_config WHERE id=1 FOR UPDATE;
 IF c IS NULL OR NOT c.enabled OR c.suspended OR NOT c.acceptance_confirmed OR c.policy_revision<>2 OR c.updated_by IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','AUTOMATION_OFF'); END IF;
 IF NOT EXISTS(SELECT 1 FROM profiles p JOIN app_admins a ON lower(a.email)=lower(p.email) WHERE p.id=c.updated_by AND a.role='super_admin' AND NOT coalesce(a.disabled,false)) THEN RETURN jsonb_build_object('ok',false,'reason','AUTHORITY_REVOKED'); END IF;
 IF p_backing IS NULL OR p_backing<0 OR p_observed IS NULL OR p_observed<now()-interval '30 seconds' OR p_observed>now()+interval '5 seconds' OR p_state_hash IS DISTINCT FROM reward_payout_evidence_hash() THEN RETURN jsonb_build_object('ok',false,'reason','BACKING_UNAVAILABLE'); END IF;
 IF EXISTS(SELECT 1 FROM reward_publish_attempts WHERE NOT retry_safe AND phase<>'CONFIRMED_VERIFIED') THEN RETURN jsonb_build_object('ok',false,'reason','PUBLICATION_PENDING'); END IF;
 IF lower(p_wallet)='0x971e7790fe6c8f77dc666bb05d4aeda362653f94' THEN RETURN jsonb_build_object('ok',false,'reason','PUBLISHER_RECIPIENT_REVIEW'); END IF;
 PERFORM 1 FROM profiles WHERE id=p_user AND lower(wallet_address)=lower(p_wallet) FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','WALLET_CHANGED'); END IF;
 IF EXISTS(SELECT 1 FROM reward_payout_approvals WHERE (user_id=p_user OR lower(wallet)=lower(p_wallet)) AND (status IN ('PROPOSED','APPROVED') OR (status='CONFIRMED' AND settlement_batch_id IS NULL))) THEN RETURN jsonb_build_object('ok',false,'reason','ALREADY_COMMITTED'); END IF;
 SELECT coalesce(sum(l.points),0) INTO actual_funded FROM flow_points_ledger l JOIN reward_reservations r ON r.reservation_id=l.reservation_id AND r.ledger_id=l.id AND r.user_id=l.user_id AND r.points=l.points AND r.program_id=l.program_id AND lower(r.wallet_address)=lower(l.wallet_address) JOIN reward_budgets b ON b.program_id=l.program_id AND b.funding_verified AND b.status='ACTIVE' AND b.reserved_points<=b.total_points WHERE l.user_id=p_user AND lower(l.wallet_address)=lower(p_wallet) AND l.funding_state='FUNDED' AND l.points>0;
 SELECT coalesce(sum((leaf->>'amount')::numeric/1000000000000000000),0) INTO actual_settled FROM reward_settlement_batches b CROSS JOIN LATERAL jsonb_array_elements(b.leaves) leaf WHERE b.chain_id=677 AND b.publication_verified_at IS NOT NULL AND lower(leaf->>'account')=lower(p_wallet);
 IF p_points<=0 OR p_points>p_available OR p_points>actual_funded-actual_settled OR p_settled<actual_settled THEN RETURN jsonb_build_object('ok',false,'reason','INVALID_AMOUNT'); END IF;
 IF jsonb_typeof(p_programs)<>'object' THEN RETURN jsonb_build_object('ok',false,'reason','PROGRAM_ATTRIBUTION_UNKNOWN'); END IF;
 FOR k,v IN SELECT * FROM jsonb_each(p_programs) LOOP
  IF k NOT IN ('CORE_SWAP','SIGNUP_BONUS','REFERRAL_MILESTONE') OR NOT EXISTS(SELECT 1 FROM reward_budgets WHERE program_id=k AND funding_verified AND status='ACTIVE' AND reserved_points<=total_points) OR jsonb_typeof(v)<>'number' OR (v::text)::numeric<=0 OR (v::text)::numeric<>floor((v::text)::numeric) THEN RETURN jsonb_build_object('ok',false,'reason','PROGRAM_NOT_ENABLED'); END IF;
  total:=total+(v::text)::bigint;
 END LOOP;
 IF total<>p_points THEN RETURN jsonb_build_object('ok',false,'reason','PROGRAM_ATTRIBUTION_UNKNOWN'); END IF;
 SELECT coalesce(sum(points),0),count(*) INTO pending,wallets FROM reward_payout_approvals WHERE status='CONFIRMED' AND settlement_batch_id IS NULL;
 IF pending+p_points>p_backing THEN RETURN jsonb_build_object('ok',false,'reason','INSUFFICIENT_BACKING'); END IF;
 IF wallets+1>200 OR pending+p_points>250000 THEN RETURN jsonb_build_object('ok',false,'reason','BATCH_CAP'); END IF;
 SELECT coalesce(sum(points),0) INTO used FROM reward_payout_approvals WHERE status='CONFIRMED' AND confirmed_at>=now()-interval '24 hours';
 IF used+p_points>500000 THEN RETURN jsonb_build_object('ok',false,'reason','DAILY_BUDGET_EXHAUSTED'); END IF;
 INSERT INTO reward_payout_approvals(user_id,wallet,points,available_points,funded_points,already_settled_points,evidence,evidence_hash,status,proposed_by,proposed_by_email,confirmed_at,decision_note,auto_approved,program_breakdown) VALUES(p_user,lower(p_wallet),p_points,p_available,p_funded,p_settled,p_evidence,p_hash,'CONFIRMED',c.updated_by,'funded-policy',now(),'Automatically approved against existing verified funding and campaign limits',true,p_programs) RETURNING id INTO new_id;
 INSERT INTO admin_audit_events(actor_user_id,actor_role,object_type,object_id,action,new_value) VALUES(c.updated_by,'automation','reward_payout_approval',new_id::text,'FUNDED_POLICY_AUTO_APPROVED',jsonb_build_object('points',p_points,'programs',p_programs,'backing',p_backing,'pendingBefore',pending,'rollingDayBefore',used,'policyRevision',2));
 RETURN jsonb_build_object('ok',true,'id',new_id);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('ok',false,'reason','ALREADY_COMMITTED');
END $$;
REVOKE ALL ON FUNCTION public.auto_approve_funded_payout(uuid,text,integer,integer,integer,integer,jsonb,jsonb,text,bigint,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.auto_approve_funded_payout(uuid,text,integer,integer,integer,integer,jsonb,jsonb,text,bigint,timestamptz,text) TO service_role;
CREATE OR REPLACE FUNCTION public.auto_approve_payout_v2(p_user uuid,p_wallet text,p_points integer,p_available integer,p_funded integer,p_settled integer,p_programs jsonb,p_evidence jsonb,p_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN RETURN jsonb_build_object('ok',false,'reason','AUTOMATION_OFF'); END $$;
COMMENT ON FUNCTION public.auto_approve_payout_v2(uuid,text,integer,integer,integer,integer,jsonb,jsonb,text) IS 'DEPRECATED: replaced by auto_approve_funded_payout with atomic backing commitments';