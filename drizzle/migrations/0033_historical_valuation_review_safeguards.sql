CREATE OR REPLACE FUNCTION public.reward_exception_evidence(p_ledger uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l flow_points_ledger%ROWTYPE; v verified_activities%ROWTYPE; total bigint;
BEGIN
 SELECT * INTO l FROM flow_points_ledger WHERE id=p_ledger;
 IF NOT FOUND THEN RAISE EXCEPTION 'Reward not found'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('reward-day:'||lower(l.wallet_address)||':'||l.day_key,0));
 SELECT * INTO l FROM flow_points_ledger WHERE id=p_ledger FOR UPDATE;
 PERFORM 1 FROM profiles WHERE id=l.user_id FOR SHARE;
 IF l.reason NOT IN ('CORE_SWAP','CORE_SWAP_V2') OR l.chain_id IS DISTINCT FROM 677 OR l.points<=0 OR l.provenance_state<>'PENDING' OR l.created_at>='2026-10-25T07:09:00Z'::timestamptz OR l.program_id IS DISTINCT FROM 'CORE_SWAP' THEN RAISE EXCEPTION 'Only existing historical pending Core Swap rewards qualify'; END IF;
 IF l.user_id IN ('532956a9-657d-489e-aa6a-5385423e9a7c'::uuid,'9af56470-d5bd-4e17-8e0e-fc651478878b'::uuid) THEN RAISE EXCEPTION 'Owner restricted rewards cannot use valuation exceptions'; END IF;
 SELECT a.* INTO v FROM verified_activities a JOIN profiles p ON p.id=l.user_id WHERE a.activity_id=l.verified_activity_id AND a.source_chain_id=677 AND lower(a.source_tx_hash)=lower(l.tx_hash) AND a.source_log_index=l.source_log_index AND l.source_log_index>=0 AND lower(a.user_wallet)=lower(l.wallet_address) AND lower(p.wallet_address)=lower(l.wallet_address) AND a.status='CONFIRMED' AND a.kind='SWAP_EXECUTED' AND a.evidence_source IN ('ROUTER_V3_RECEIPT','ROUTER_V4_SWAP_ACTIVITY') AND a.amount_raw::numeric>0 FOR SHARE OF a;
 IF NOT FOUND THEN RAISE EXCEPTION 'Canonical receipt and current bound wallet required'; END IF;
 IF l.policy_version<>'FLOW_POINTS_V2' OR v.occurred_at<'2026-08-20T15:00:00Z' OR l.day_key IS DISTINCT FROM to_char(v.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD') OR l.verified_usd IS NULL OR l.verified_usd::text IN ('NaN','Infinity','-Infinity') OR l.verified_usd<5 OR l.points>floor(l.verified_usd) OR l.base_points<l.points THEN RAISE EXCEPTION 'Policy or original economics violation'; END IF;
 IF EXISTS(SELECT 1 FROM flow_points_ledger o WHERE o.id<>l.id AND o.chain_id=677 AND o.reason IN ('CORE_SWAP','CORE_SWAP_V2') AND o.points>0 AND (lower(o.tx_hash)=lower(l.tx_hash) OR o.verified_activity_id=l.verified_activity_id)) THEN RAISE EXCEPTION 'Duplicate reward cannot be waived'; END IF;
 SELECT coalesce(sum(points),0) INTO total FROM flow_points_ledger WHERE lower(wallet_address)=lower(l.wallet_address) AND day_key=l.day_key AND chain_id=677 AND reason IN ('CORE_SWAP','CORE_SWAP_V2');
 IF total>1000 THEN RAISE EXCEPTION 'Daily cap cannot be waived'; END IF;
 IF l.funding_state='FUNDED' THEN
  PERFORM 1 FROM reward_reservations r WHERE r.reservation_id=l.reservation_id AND r.ledger_id=l.id AND r.user_id=l.user_id AND lower(r.wallet_address)=lower(l.wallet_address) AND r.points=l.points AND r.program_id='CORE_SWAP' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original matching reservation required'; END IF;
 ELSIF l.funding_state<>'UNFUNDED' OR l.reservation_id IS NOT NULL THEN RAISE EXCEPTION 'Invalid funding lifecycle'; END IF;
 RETURN jsonb_build_object('ledgerId',l.id,'points',l.points,'basePoints',l.base_points,'txHash',l.tx_hash,'activityId',v.activity_id,'logIndex',v.source_log_index,'evidenceSource',v.evidence_source,'occurredAt',v.occurred_at,'amountRaw',v.amount_raw,'token',v.token,'policyVersion',l.policy_version,'recordedUsd',l.verified_usd,'fundingState',l.funding_state,'reservationId',l.reservation_id,'wallet',l.wallet_address,'user',l.user_id);
END $$;
REVOKE ALL ON FUNCTION public.reward_exception_evidence(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reward_exception_evidence(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.propose_reward_evidence_exception(p_ledger uuid,p_actor uuid,p_email text,p_price_evidence jsonb,p_uncertainty text,p_rationale text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE evidence jsonb; rid uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app_admins WHERE email=lower(p_email) AND NOT disabled) OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_actor AND lower(email)=lower(p_email)) THEN RAISE EXCEPTION 'Current admin required'; END IF;
 IF length(coalesce(trim(p_rationale),''))<20 OR length(p_rationale)>2000 OR length(coalesce(trim(p_uncertainty),''))<5 OR length(p_uncertainty)>1000 THEN RAISE EXCEPTION 'Rationale and uncertainty required'; END IF;
 IF jsonb_typeof(coalesce(p_price_evidence,'{}'))<>'object' OR pg_column_size(coalesce(p_price_evidence,'{}'))>16000 THEN RAISE EXCEPTION 'Invalid optional price evidence'; END IF;
 evidence:=reward_exception_evidence(p_ledger);
 INSERT INTO reward_evidence_reviews(ledger_id,policy_id,points,onchain_evidence,price_evidence,uncertainty,rationale,proposed_by,proposed_by_email) VALUES(p_ledger,'HISTORICAL_PRICING_EXCEPTION_V1',(evidence->>'points')::integer,evidence,coalesce(p_price_evidence,'{}')||jsonb_build_object('scope','MISSING_HISTORICAL_VALUATION_ONLY','sourceUnavailable',coalesce(length(trim(p_price_evidence->>'source')),0)<5),trim(p_uncertainty),trim(p_rationale),p_actor,lower(p_email)) RETURNING id INTO rid;
 INSERT INTO admin_audit_events(actor_user_id,actor_email,actor_role,object_type,object_id,action,new_value,reason) VALUES(p_actor,lower(p_email),'operator','reward_evidence',rid::text,'EXCEPTION_PROPOSED',jsonb_build_object('ledgerId',p_ledger,'points',evidence->'points','scope','MISSING_HISTORICAL_VALUATION_ONLY'),trim(p_rationale));
 RETURN rid;
END $$;
CREATE OR REPLACE FUNCTION public.decide_reward_evidence_exception(p_review uuid,p_actor uuid,p_email text,p_decision text,p_note text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r reward_evidence_reviews%ROWTYPE; evidence jsonb;
BEGIN
 IF p_decision IS NULL OR p_decision NOT IN ('APPROVED','REJECTED') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app_admins WHERE email=lower(p_email) AND role='super_admin' AND NOT disabled) OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_actor AND lower(email)=lower(p_email)) THEN RAISE EXCEPTION 'Current super admin required'; END IF;
 SELECT * INTO r FROM reward_evidence_reviews WHERE id=p_review FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Review not found'; END IF;
 IF r.proposed_by=p_actor OR lower(r.proposed_by_email)=lower(p_email) THEN RAISE EXCEPTION 'A different approver is required'; END IF;
 IF r.status=p_decision THEN RETURN 'ALREADY_'||p_decision; END IF;
 IF r.status<>'PROPOSED' OR r.policy_id<>'HISTORICAL_PRICING_EXCEPTION_V1' THEN RAISE EXCEPTION 'Review is not an open approved-policy proposal'; END IF;
 IF p_decision='APPROVED' THEN
  evidence:=reward_exception_evidence(r.ledger_id);
  IF evidence IS DISTINCT FROM r.onchain_evidence OR (evidence->>'points')::integer<>r.points THEN RAISE EXCEPTION 'Evidence changed; a fresh proposal is required'; END IF;
 END IF;
 UPDATE reward_evidence_reviews SET status=p_decision,decided_by=p_actor,decided_by_email=lower(p_email),decision_note=left(p_note,1000),decided_at=now() WHERE id=r.id;
 IF p_decision='APPROVED' THEN UPDATE flow_points_ledger SET provenance_state='EXCEPTION_APPROVED' WHERE id=r.ledger_id; END IF;
 INSERT INTO admin_audit_events(actor_user_id,actor_email,actor_role,object_type,object_id,action,new_value,reason) VALUES(p_actor,lower(p_email),'super_admin','reward_evidence',r.id::text,'EXCEPTION_'||p_decision,jsonb_build_object('ledgerId',r.ledger_id,'points',r.points,'scope','MISSING_HISTORICAL_VALUATION_ONLY','reservationUnchanged',true),left(p_note,1000));
 RETURN p_decision;
END $$;
REVOKE ALL ON FUNCTION public.propose_reward_evidence_exception(uuid,uuid,text,jsonb,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.decide_reward_evidence_exception(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.propose_reward_evidence_exception(uuid,uuid,text,jsonb,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.decide_reward_evidence_exception(uuid,uuid,text,text,text) TO service_role;