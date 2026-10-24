CREATE TABLE public.reward_evidence_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id uuid NOT NULL REFERENCES public.flow_points_ledger(id),
  policy_id text NOT NULL DEFAULT 'HISTORICAL_PRICING_EXCEPTION_V1',
  status text NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED','APPROVED','REJECTED','WITHDRAWN')),
  points integer NOT NULL,
  onchain_evidence jsonb NOT NULL,
  price_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  uncertainty text NOT NULL,
  rationale text NOT NULL,
  proposed_by uuid NOT NULL,
  proposed_by_email text NOT NULL,
  decided_by uuid,
  decided_by_email text,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE UNIQUE INDEX reward_evidence_reviews_one_open ON public.reward_evidence_reviews(ledger_id) WHERE status IN ('PROPOSED','APPROVED');
GRANT ALL ON public.reward_evidence_reviews TO service_role;
ALTER TABLE public.reward_evidence_reviews ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.propose_reward_evidence_exception(p_ledger uuid, p_actor uuid, p_email text, p_price_evidence jsonb, p_uncertainty text, p_rationale text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l flow_points_ledger%ROWTYPE; v verified_activities%ROWTYPE; rid uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM app_admins WHERE email=lower(p_email) AND NOT disabled) OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_actor AND lower(email)=lower(p_email)) THEN RAISE EXCEPTION 'Current admin required'; END IF;
  IF length(coalesce(trim(p_rationale),'')) < 20 OR length(p_rationale) > 2000 THEN RAISE EXCEPTION 'Rationale of 20-2000 characters required'; END IF;
  IF length(coalesce(trim(p_uncertainty),'')) < 5 OR length(p_uncertainty) > 1000 THEN RAISE EXCEPTION 'Uncertainty statement required'; END IF;
  IF pg_column_size(coalesce(p_price_evidence,'{}'::jsonb)) > 16000 THEN RAISE EXCEPTION 'Price evidence too large'; END IF;
  SELECT * INTO l FROM flow_points_ledger WHERE id=p_ledger FOR UPDATE;
  IF NOT FOUND OR l.reason NOT IN ('CORE_SWAP','CORE_SWAP_V2') OR l.points <= 0 OR l.chain_id IS DISTINCT FROM 677 THEN RAISE EXCEPTION 'Only Mainnet Core Swap rewards use this review'; END IF;
  IF l.provenance_state <> 'PENDING' THEN RAISE EXCEPTION 'Reward is not awaiting evidence review'; END IF;
  SELECT a.* INTO v FROM verified_activities a JOIN profiles p ON p.id=l.user_id
   WHERE a.activity_id=l.verified_activity_id AND a.source_chain_id=677 AND lower(a.source_tx_hash)=lower(l.tx_hash)
     AND lower(a.user_wallet)=lower(l.wallet_address) AND lower(p.wallet_address)=lower(l.wallet_address)
     AND a.status='CONFIRMED' AND a.kind='SWAP_EXECUTED' AND a.evidence_source IN ('ROUTER_V3_RECEIPT','ROUTER_V4_SWAP_ACTIVITY') AND a.amount_raw::numeric > 0;
  IF NOT FOUND THEN RAISE EXCEPTION 'Independent on-chain swap evidence and bound wallet required'; END IF;
  IF EXISTS(SELECT 1 FROM flow_points_ledger o WHERE o.id<>l.id AND lower(o.tx_hash)=lower(l.tx_hash) AND o.reason=l.reason AND o.points>0) THEN RAISE EXCEPTION 'Duplicate award for this transaction'; END IF;
  INSERT INTO reward_evidence_reviews(ledger_id, points, onchain_evidence, price_evidence, uncertainty, rationale, proposed_by, proposed_by_email)
  VALUES (l.id, l.points, jsonb_build_object('txHash',l.tx_hash,'logIndex',v.source_log_index,'evidenceSource',v.evidence_source,'occurredAt',v.occurred_at,'amountRaw',v.amount_raw,'token',v.token,'policyVersion',l.policy_version,'recordedUsd',l.verified_usd), coalesce(p_price_evidence,'{}'::jsonb), trim(p_uncertainty), trim(p_rationale), p_actor, lower(p_email))
  RETURNING id INTO rid;
  INSERT INTO admin_audit_events(actor_user_id, actor_email, actor_role, object_type, object_id, action, new_value, reason)
  VALUES (p_actor, lower(p_email), 'admin', 'reward_evidence', rid::text, 'EXCEPTION_PROPOSED', jsonb_build_object('ledgerId',l.id,'points',l.points), trim(p_rationale));
  RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.decide_reward_evidence_exception(p_review uuid, p_actor uuid, p_email text, p_decision text, p_note text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r reward_evidence_reviews%ROWTYPE; l flow_points_ledger%ROWTYPE;
BEGIN
  IF p_decision NOT IN ('APPROVED','REJECTED') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
  IF NOT EXISTS(SELECT 1 FROM app_admins WHERE email=lower(p_email) AND role='super_admin' AND NOT disabled) OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_actor AND lower(email)=lower(p_email)) THEN RAISE EXCEPTION 'Current super admin required'; END IF;
  SELECT * INTO r FROM reward_evidence_reviews WHERE id=p_review FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review not found'; END IF;
  IF r.status = p_decision THEN RETURN 'ALREADY_'||p_decision; END IF;
  IF r.status <> 'PROPOSED' THEN RAISE EXCEPTION 'Review is %', r.status; END IF;
  IF r.proposed_by = p_actor THEN RAISE EXCEPTION 'A different reviewer must decide this exception'; END IF;
  SELECT * INTO l FROM flow_points_ledger WHERE id=r.ledger_id FOR UPDATE;
  IF l.points <> r.points OR l.provenance_state <> 'PENDING' THEN
    UPDATE reward_evidence_reviews SET status='WITHDRAWN', decided_at=now(), decision_note='Record changed after proposal' WHERE id=r.id;
    RETURN 'STALE';
  END IF;
  UPDATE reward_evidence_reviews SET status=p_decision, decided_by=p_actor, decided_by_email=lower(p_email), decision_note=left(p_note,1000), decided_at=now() WHERE id=r.id;
  IF p_decision='APPROVED' THEN UPDATE flow_points_ledger SET provenance_state='EXCEPTION_APPROVED' WHERE id=l.id; END IF;
  INSERT INTO admin_audit_events(actor_user_id, actor_email, actor_role, object_type, object_id, action, old_value, new_value, reason)
  VALUES (p_actor, lower(p_email), 'super_admin', 'reward_evidence', r.id::text, 'EXCEPTION_'||p_decision, jsonb_build_object('provenance','PENDING'), jsonb_build_object('ledgerId',l.id,'points',l.points,'provenance',CASE WHEN p_decision='APPROVED' THEN 'EXCEPTION_APPROVED' ELSE 'PENDING' END), left(p_note,1000));
  RETURN p_decision;
END $$;
REVOKE ALL ON FUNCTION public.propose_reward_evidence_exception(uuid,uuid,text,jsonb,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decide_reward_evidence_exception(uuid,uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.propose_reward_evidence_exception(uuid,uuid,text,jsonb,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.decide_reward_evidence_exception(uuid,uuid,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.core_swap_integrity_update_guard()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$ BEGIN IF TG_OP='UPDATE' AND OLD.reason IN ('CORE_SWAP','CORE_SWAP_V2') AND OLD.points>0 THEN IF (NEW.points,NEW.user_id,NEW.wallet_address,NEW.chain_id,NEW.tx_hash,NEW.source_log_index,NEW.verified_activity_id,NEW.verified_usd,NEW.policy_version,NEW.reason) IS DISTINCT FROM (OLD.points,OLD.user_id,OLD.wallet_address,OLD.chain_id,OLD.tx_hash,OLD.source_log_index,OLD.verified_activity_id,OLD.verified_usd,OLD.policy_version,OLD.reason) THEN RAISE EXCEPTION 'Historical reward economics and identity are immutable'; END IF; IF NEW.provenance_state IS DISTINCT FROM OLD.provenance_state AND NOT (OLD.provenance_state='PENDING' AND NEW.provenance_state='EXCEPTION_APPROVED' AND EXISTS(SELECT 1 FROM public.reward_evidence_reviews r WHERE r.ledger_id=OLD.id AND r.status='APPROVED' AND r.points=OLD.points AND r.decided_by IS DISTINCT FROM r.proposed_by)) THEN RAISE EXCEPTION 'Independent historical provenance approval workflow required'; END IF; END IF; RETURN NEW; END $function$;

CREATE OR REPLACE FUNCTION public.core_swap_provenance_guard()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$ BEGIN IF NEW.reason IN ('CORE_SWAP','CORE_SWAP_V2') THEN IF TG_OP='INSERT' AND NEW.points>0 THEN IF NEW.chain_id IS DISTINCT FROM 677 OR NEW.provenance_state<>'VERIFIED' OR NEW.verified_usd IS NULL OR NEW.verified_usd<5 OR NEW.points>floor(NEW.verified_usd) OR NEW.source_log_index IS NULL OR NEW.source_log_index<0 OR NOT EXISTS (SELECT 1 FROM public.verified_activities v JOIN public.profiles p ON p.id=NEW.user_id WHERE v.activity_id=NEW.verified_activity_id AND v.source_chain_id=677 AND lower(v.source_tx_hash)=lower(NEW.tx_hash) AND v.source_log_index=NEW.source_log_index AND lower(v.user_wallet)=lower(NEW.wallet_address) AND lower(p.wallet_address)=lower(NEW.wallet_address) AND v.status='CONFIRMED' AND v.kind='SWAP_EXECUTED' AND v.evidence_source IN ('ROUTER_V3_RECEIPT','ROUTER_V4_SWAP_ACTIVITY') AND v.amount_raw::numeric>0) THEN RAISE EXCEPTION 'Independent Mainnet swap provenance required'; END IF; END IF; IF TG_OP='UPDATE' AND NEW.funding_state='FUNDED' AND OLD.funding_state IS DISTINCT FROM 'FUNDED' AND NEW.provenance_state NOT IN ('VERIFIED','EXCEPTION_APPROVED') THEN RAISE EXCEPTION 'Reward provenance review required before funding'; END IF; END IF; RETURN NEW; END $function$;

CREATE OR REPLACE FUNCTION public.confirm_reward_funding_snapshot(p_snapshot uuid, p_actor uuid, p_email text, p_role text, p_expected_hash text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE s reward_funding_snapshots%ROWTYPE; r jsonb; labelled jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.app_admins WHERE email=lower(p_email) AND role='super_admin' AND NOT disabled) OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND lower(email)=lower(p_email)) THEN RAISE EXCEPTION 'Current super admin required'; END IF; IF p_role <> 'super_admin' THEN RAISE EXCEPTION 'super admin approval authority required'; END IF;
  SELECT * INTO s FROM reward_funding_snapshots WHERE id = p_snapshot FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'snapshot not found'; END IF;
  IF s.status = 'CONFIRMED' THEN RETURN jsonb_build_object('outcome','ALREADY_CONFIRMED','result',s.result); END IF;
  IF s.status <> 'APPROVED' THEN RAISE EXCEPTION 'snapshot is %', s.status; END IF;
  PERFORM 1 FROM public.flow_points_ledger WHERE id=ANY(s.ledger_ids) ORDER BY id FOR UPDATE; PERFORM 1 FROM public.profiles WHERE id IN (SELECT user_id FROM public.flow_points_ledger WHERE id=ANY(s.ledger_ids)) ORDER BY id FOR SHARE; IF EXISTS(SELECT 1 FROM public.flow_points_ledger WHERE id=ANY(s.ledger_ids) AND reason IN ('CORE_SWAP','CORE_SWAP_V2') AND provenance_state NOT IN ('VERIFIED','EXCEPTION_APPROVED')) THEN RAISE EXCEPTION 'Independent reward provenance required'; END IF; IF p_expected_hash IS DISTINCT FROM s.snapshot_hash THEN RAISE EXCEPTION 'snapshot hash mismatch'; END IF;
  IF reward_funding_hash(s.ledger_ids) <> s.snapshot_hash THEN
    UPDATE reward_funding_snapshots SET status='STALE', updated_at=now() WHERE id=s.id;
    INSERT INTO reward_ops_exceptions(kind, severity, dedupe_key, detail, corrective_action)
      VALUES ('STALE_FUNDING_SNAPSHOT','BLOCK','stale:'||s.id,'Reward records changed after the funding snapshot was created.','Create a new funding snapshot and approve it again.')
      ON CONFLICT (dedupe_key) DO NOTHING;
    RETURN jsonb_build_object('outcome','STALE');
  END IF;
  SELECT jsonb_agg(id) INTO labelled FROM flow_points_ledger WHERE id = ANY(s.ledger_ids) AND program_id IS NULL;
  r := reserve_reward_budget(s.ledger_ids, s.program_id, p_email, 'V36.10 funding snapshot '||s.id||' hash '||s.snapshot_hash);
  IF r->>'outcome' <> 'CONFIRMED' THEN RAISE EXCEPTION 'reservation failed: %', r; END IF;
  r := r || jsonb_build_object('programLabelAssignedFromNull', coalesce(labelled,'[]'::jsonb));
  UPDATE reward_funding_snapshots SET status='CONFIRMED', confirmed_by=p_actor, confirmed_by_email=p_email, confirmed_at=now(), result=r, updated_at=now() WHERE id=s.id;
  INSERT INTO admin_audit_events(actor_user_id, actor_email, actor_role, object_type, object_id, action, old_value, new_value, reason)
  VALUES (p_actor, p_email, p_role, 'reward_funding', s.id::text, 'CONFIRMED', jsonb_build_object('hash',s.snapshot_hash,'evidence',s.evidence), r, s.note);
  RETURN jsonb_build_object('outcome','CONFIRMED','result',r);
END $function$;