CREATE TABLE public.vote_events (
  tx_hash text NOT NULL, log_index integer NOT NULL, voter text NOT NULL,
  project_id integer NOT NULL, block_number bigint NOT NULL, block_ts timestamptz NOT NULL,
  contract text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tx_hash, log_index));
CREATE INDEX vote_events_ts ON public.vote_events (project_id, block_ts);
GRANT SELECT ON public.vote_events TO anon, authenticated;
GRANT ALL ON public.vote_events TO service_role;
ALTER TABLE public.vote_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public on-chain votes" ON public.vote_events FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.vote_indexer_state (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1), contract text NOT NULL, implementation text NOT NULL,
  last_block bigint NOT NULL, halted boolean NOT NULL DEFAULT false, halt_reason text,
  synced_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.vote_indexer_state TO service_role;
ALTER TABLE public.vote_indexer_state ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.vote_payout_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1), enabled boolean NOT NULL DEFAULT false,
  min_claim_flow numeric NOT NULL DEFAULT 10, per_claim_cap_flow numeric NOT NULL DEFAULT 500000,
  daily_cap_flow numeric NOT NULL DEFAULT 2000000, updated_by_email text, updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.vote_payout_config (id) VALUES (1);
GRANT ALL ON public.vote_payout_config TO service_role;
ALTER TABLE public.vote_payout_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.vote_reward_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), label text NOT NULL, starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL, bot_received numeric NOT NULL CHECK (bot_received > 0),
  flow_per_bot numeric NOT NULL CHECK (flow_per_bot > 0), price_evidence jsonb NOT NULL,
  implementation text NOT NULL, total_flow numeric NOT NULL, voter_count integer NOT NULL,
  created_by_email text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (starts_at, ends_at));
GRANT ALL ON public.vote_reward_periods TO service_role;
ALTER TABLE public.vote_reward_periods ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.voter_credits (
  period_id uuid NOT NULL REFERENCES public.vote_reward_periods(id), wallet text NOT NULL,
  votes integer NOT NULL, tier text NOT NULL, flow numeric NOT NULL CHECK (flow >= 0),
  PRIMARY KEY (period_id, wallet));
GRANT ALL ON public.voter_credits TO service_role;
ALTER TABLE public.voter_credits ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.voter_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), wallet text NOT NULL, flow numeric NOT NULL CHECK (flow > 0),
  status text NOT NULL DEFAULT 'RESERVED' CHECK (status IN ('RESERVED','SENT','CONFIRMED','FAILED')),
  tx_hash text, detail text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX voter_claims_one_open ON public.voter_claims (wallet) WHERE status IN ('RESERVED','SENT');
GRANT ALL ON public.voter_claims TO service_role;
ALTER TABLE public.voter_claims ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.top_flowbridge_voters(p_since timestamptz, p_until timestamptz, p_limit integer)
RETURNS TABLE(voter text, votes bigint) LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT voter, count(*) FROM public.vote_events
  WHERE project_id = 919 AND block_ts >= p_since AND block_ts < p_until
  GROUP BY voter ORDER BY count(*) DESC, min(block_ts) ASC LIMIT least(greatest(p_limit,1),100) $$;
GRANT EXECUTE ON FUNCTION public.top_flowbridge_voters(timestamptz, timestamptz, integer) TO anon, authenticated, service_role;

-- balance = credits - confirmed/open claims (FAILED restores)
CREATE OR REPLACE FUNCTION public.voter_available_flow(p_wallet text) RETURNS numeric
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce((SELECT sum(flow) FROM voter_credits WHERE wallet = p_wallet),0)
       - coalesce((SELECT sum(flow) FROM voter_claims WHERE wallet = p_wallet AND status <> 'FAILED'),0) $$;
REVOKE ALL ON FUNCTION public.voter_available_flow(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.voter_available_flow(text) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_voter_claim(p_wallet text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg vote_payout_config; amt numeric; today numeric; cid uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('voter_claim:' || p_wallet));
  PERFORM pg_advisory_xact_lock(hashtext('voter_claim_daily'));
  SELECT * INTO cfg FROM vote_payout_config WHERE id = 1;
  IF NOT cfg.enabled THEN RETURN jsonb_build_object('ok',false,'reason','PAUSED'); END IF;
  IF EXISTS (SELECT 1 FROM voter_claims WHERE wallet = p_wallet AND status IN ('RESERVED','SENT')) THEN
    RETURN jsonb_build_object('ok',false,'reason','CLAIM_IN_PROGRESS'); END IF;
  amt := floor(voter_available_flow(p_wallet) * 1e6) / 1e6;
  IF amt < cfg.min_claim_flow THEN RETURN jsonb_build_object('ok',false,'reason','BELOW_MINIMUM','available',amt); END IF;
  IF amt > cfg.per_claim_cap_flow THEN amt := cfg.per_claim_cap_flow; END IF;
  SELECT coalesce(sum(flow),0) INTO today FROM voter_claims WHERE status <> 'FAILED' AND created_at > now() - interval '24 hours';
  IF today + amt > cfg.daily_cap_flow THEN RETURN jsonb_build_object('ok',false,'reason','DAILY_CAP'); END IF;
  INSERT INTO voter_claims (wallet, flow) VALUES (p_wallet, amt) RETURNING id INTO cid;
  RETURN jsonb_build_object('ok',true,'claim_id',cid,'flow',amt);
END $$;
REVOKE ALL ON FUNCTION public.reserve_voter_claim(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_voter_claim(text) TO service_role;