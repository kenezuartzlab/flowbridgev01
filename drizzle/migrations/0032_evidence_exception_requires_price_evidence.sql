CREATE OR REPLACE FUNCTION public.propose_reward_evidence_exception(p_ledger uuid, p_actor uuid, p_email text, p_price_evidence jsonb, p_uncertainty text, p_rationale text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l flow_points_ledger%ROWTYPE; v verified_activities%ROWTYPE; rid uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM app_admins WHERE email=lower(p_email) AND NOT disabled) OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_actor AND lower(email)=lower(p_email)) THEN RAISE EXCEPTION 'Current admin required'; END IF;
  IF length(coalesce(trim(p_rationale),'')) < 20 OR length(p_rationale) > 2000 THEN RAISE EXCEPTION 'Rationale of 20-2000 characters required'; END IF;
  IF length(coalesce(trim(p_uncertainty),'')) < 5 OR length(p_uncertainty) > 1000 THEN RAISE EXCEPTION 'Uncertainty statement required'; END IF;
  IF length(coalesce(trim(p_price_evidence->>'source'),'')) < 5 THEN RAISE EXCEPTION 'Documented historical price evidence required'; END IF;
  IF pg_column_size(coalesce(p_price_evidence,'{}'::jsonb)) > 16000 THEN RAISE EXCEPTION 'Price evidence too large'; END IF;
  SELECT * INTO l FROM flow_points_ledger WHERE id=p_ledger FOR UPDATE;
  IF NOT FOUND OR l.reason NOT IN ('CORE_SWAP','CORE_SWAP_V2') OR l.points <= 0 OR l.chain_id IS DISTINCT FROM 677 THEN RAISE EXCEPTION 'Only Mainnet Core Swap rewards use this review'; END IF;
  IF l.provenance_state <> 'PENDING' THEN RAISE EXCEPTION 'Reward is not awaiting evidence review'; END IF;
  IF l.verified_usd IS NULL OR l.verified_usd < 5 OR l.points > floor(l.verified_usd) THEN RAISE EXCEPTION 'Reward does not meet the approved pricing policy'; END IF;
  IF l.funding_state='FUNDED' AND (l.reservation_id IS NULL OR NOT EXISTS(SELECT 1 FROM reward_reservations rr WHERE rr.reservation_id=l.reservation_id AND rr.ledger_id=l.id AND rr.points=l.points)) THEN RAISE EXCEPTION 'Funded reward lacks its original reservation'; END IF;
  SELECT a.* INTO v FROM verified_activities a JOIN profiles p ON p.id=l.user_id
   WHERE a.activity_id=l.verified_activity_id AND a.source_chain_id=677 AND lower(a.source_tx_hash)=lower(l.tx_hash)
     AND lower(a.user_wallet)=lower(l.wallet_address) AND lower(p.wallet_address)=lower(l.wallet_address)
     AND a.status='CONFIRMED' AND a.kind='SWAP_EXECUTED' AND a.evidence_source IN ('ROUTER_V3_RECEIPT','ROUTER_V4_SWAP_ACTIVITY') AND a.amount_raw::numeric > 0;
  IF NOT FOUND THEN RAISE EXCEPTION 'Independent on-chain swap evidence and bound wallet required'; END IF;
  IF EXISTS(SELECT 1 FROM flow_points_ledger o WHERE o.id<>l.id AND lower(o.tx_hash)=lower(l.tx_hash) AND o.reason=l.reason AND o.points>0) THEN RAISE EXCEPTION 'Duplicate award for this transaction'; END IF;
  INSERT INTO reward_evidence_reviews(ledger_id, points, onchain_evidence, price_evidence, uncertainty, rationale, proposed_by, proposed_by_email)
  VALUES (l.id, l.points, jsonb_build_object('txHash',l.tx_hash,'logIndex',v.source_log_index,'evidenceSource',v.evidence_source,'occurredAt',v.occurred_at,'amountRaw',v.amount_raw,'token',v.token,'policyVersion',l.policy_version,'recordedUsd',l.verified_usd,'fundingState',l.funding_state,'reservationId',l.reservation_id), coalesce(p_price_evidence,'{}'::jsonb), trim(p_uncertainty), trim(p_rationale), p_actor, lower(p_email))
  RETURNING id INTO rid;
  INSERT INTO admin_audit_events(actor_user_id, actor_email, actor_role, object_type, object_id, action, new_value, reason)
  VALUES (p_actor, lower(p_email), 'admin', 'reward_evidence', rid::text, 'EXCEPTION_PROPOSED', jsonb_build_object('ledgerId',l.id,'points',l.points), trim(p_rationale));
  RETURN rid;
END $$;
REVOKE ALL ON FUNCTION public.propose_reward_evidence_exception(uuid,uuid,text,jsonb,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.propose_reward_evidence_exception(uuid,uuid,text,jsonb,text,text) TO service_role;