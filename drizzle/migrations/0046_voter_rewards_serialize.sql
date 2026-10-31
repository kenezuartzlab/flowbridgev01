CREATE OR REPLACE FUNCTION public.reserve_voter_claim(p_wallet text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg vote_payout_config; amt numeric; today numeric; cid uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('voter_claim_global'));
  SELECT * INTO cfg FROM vote_payout_config WHERE id = 1;
  IF NOT cfg.enabled THEN RETURN jsonb_build_object('ok',false,'reason','PAUSED'); END IF;
  IF EXISTS (SELECT 1 FROM voter_claims WHERE wallet = p_wallet AND status IN ('RESERVED','SENT')) THEN
    RETURN jsonb_build_object('ok',false,'reason','CLAIM_IN_PROGRESS'); END IF;
  -- one payout transaction in flight at a time across all wallets (single sender nonce)
  IF EXISTS (SELECT 1 FROM voter_claims WHERE status IN ('RESERVED','SENT')) THEN
    RETURN jsonb_build_object('ok',false,'reason','BUSY'); END IF;
  amt := floor(voter_available_flow(p_wallet) * 1e6) / 1e6;
  IF amt < cfg.min_claim_flow THEN RETURN jsonb_build_object('ok',false,'reason','BELOW_MINIMUM','available',amt); END IF;
  IF amt > cfg.per_claim_cap_flow THEN amt := cfg.per_claim_cap_flow; END IF;
  SELECT coalesce(sum(flow),0) INTO today FROM voter_claims WHERE status <> 'FAILED' AND created_at > now() - interval '24 hours';
  IF today + amt > cfg.daily_cap_flow THEN RETURN jsonb_build_object('ok',false,'reason','DAILY_CAP'); END IF;
  INSERT INTO voter_claims (wallet, flow) VALUES (p_wallet, amt) RETURNING id INTO cid;
  RETURN jsonb_build_object('ok',true,'claim_id',cid,'flow',amt);
END $$;

CREATE OR REPLACE FUNCTION public.credit_vote_period(p_period jsonb, p_credits jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid;
BEGIN
  INSERT INTO vote_reward_periods (label, starts_at, ends_at, bot_received, flow_per_bot, price_evidence, implementation, total_flow, voter_count, created_by_email)
  VALUES (p_period->>'label', (p_period->>'starts_at')::timestamptz, (p_period->>'ends_at')::timestamptz,
    (p_period->>'bot_received')::numeric, (p_period->>'flow_per_bot')::numeric, p_period->'price_evidence',
    p_period->>'implementation', (p_period->>'total_flow')::numeric, (p_period->>'voter_count')::int, p_period->>'created_by_email')
  RETURNING id INTO pid;
  INSERT INTO voter_credits (period_id, wallet, votes, tier, flow)
  SELECT pid, lower(c->>'wallet'), (c->>'votes')::int, c->>'tier', (c->>'flow')::numeric FROM jsonb_array_elements(p_credits) c;
  RETURN pid;
END $$;
REVOKE ALL ON FUNCTION public.credit_vote_period(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_vote_period(jsonb, jsonb) TO service_role;