CREATE TABLE public.verified_activities (
  activity_id text PRIMARY KEY,
  user_wallet text NOT NULL,
  kind text NOT NULL,
  source_chain_id bigint NOT NULL,
  source_tx_hash text NOT NULL,
  source_log_index integer NOT NULL,
  amount_raw text NOT NULL,
  campaign_id text NOT NULL,
  intent_hash text NOT NULL,
  intent_nonce text NOT NULL,
  status text NOT NULL DEFAULT 'CONFIRMED',
  action_type text NOT NULL,
  destination_chain_id bigint NOT NULL,
  token text NOT NULL,
  occurred_at timestamptz NOT NULL,
  observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT verified_activities_activity_id_format CHECK (activity_id ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT verified_activities_user_wallet_format CHECK (user_wallet ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT verified_activities_kind_check CHECK (kind IN ('BRIDGE_SUBMITTED','BRIDGE_COMPLETED')),
  CONSTRAINT verified_activities_source_chain_positive CHECK (source_chain_id > 0),
  CONSTRAINT verified_activities_source_tx_format CHECK (source_tx_hash ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT verified_activities_log_index_check CHECK (source_log_index >= 0),
  CONSTRAINT verified_activities_amount_raw_format CHECK (amount_raw ~ '^[0-9]+$' AND amount_raw !~ '^0+$'),
  CONSTRAINT verified_activities_campaign_id_format CHECK (campaign_id ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT verified_activities_intent_hash_format CHECK (intent_hash ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT verified_activities_intent_nonce_format CHECK (intent_nonce ~ '^[0-9]+$'),
  CONSTRAINT verified_activities_status_check CHECK (status = 'CONFIRMED'),
  CONSTRAINT verified_activities_action_type_format CHECK (action_type ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT verified_activities_destination_chain_positive CHECK (destination_chain_id > 0),
  CONSTRAINT verified_activities_token_format CHECK (token ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT verified_activities_source_event_unique UNIQUE (source_chain_id, source_tx_hash, source_log_index),
  CONSTRAINT verified_activities_wallet_nonce_unique UNIQUE (user_wallet, intent_nonce),
  CONSTRAINT verified_activities_intent_hash_unique UNIQUE (intent_hash)
);

GRANT ALL ON public.verified_activities TO service_role;
REVOKE ALL ON public.verified_activities FROM anon, authenticated;

ALTER TABLE public.verified_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all client access to verified_activities"
  ON public.verified_activities
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.admin_record_verified_activity(
  p_activity_id text,
  p_user_wallet text,
  p_kind text,
  p_source_chain_id bigint,
  p_source_tx_hash text,
  p_source_log_index integer,
  p_amount_raw text,
  p_campaign_id text,
  p_intent_hash text,
  p_intent_nonce text,
  p_action_type text,
  p_destination_chain_id bigint,
  p_token text,
  p_occurred_at timestamptz,
  p_observed_at timestamptz
)
RETURNS TABLE(inserted boolean, activity_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_activity_id text := lower(trim(p_activity_id));
  v_wallet text := lower(trim(p_user_wallet));
  v_kind text := upper(trim(p_kind));
  v_tx text := lower(trim(p_source_tx_hash));
  v_campaign text := lower(trim(p_campaign_id));
  v_intent_hash text := lower(trim(p_intent_hash));
  v_nonce text := trim(p_intent_nonce);
  v_amount text := trim(p_amount_raw);
  v_action text := lower(trim(p_action_type));
  v_token text := lower(trim(p_token));
  v_row public.verified_activities;
BEGIN
  IF v_activity_id !~ '^0x[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid activity_id'; END IF;
  IF v_wallet !~ '^0x[0-9a-f]{40}$' THEN RAISE EXCEPTION 'invalid user_wallet'; END IF;
  IF v_kind NOT IN ('BRIDGE_SUBMITTED','BRIDGE_COMPLETED') THEN RAISE EXCEPTION 'invalid kind'; END IF;
  IF p_source_chain_id IS NULL OR p_source_chain_id <= 0 THEN RAISE EXCEPTION 'invalid source_chain_id'; END IF;
  IF v_tx !~ '^0x[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid source_tx_hash'; END IF;
  IF p_source_log_index IS NULL OR p_source_log_index < 0 THEN RAISE EXCEPTION 'invalid source_log_index'; END IF;
  IF v_amount !~ '^[0-9]+$' OR v_amount ~ '^0+$' THEN RAISE EXCEPTION 'invalid amount_raw'; END IF;
  IF v_campaign !~ '^0x[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid campaign_id'; END IF;
  IF v_intent_hash !~ '^0x[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid intent_hash'; END IF;
  IF v_nonce !~ '^[0-9]+$' THEN RAISE EXCEPTION 'invalid intent_nonce'; END IF;
  IF v_action !~ '^0x[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid action_type'; END IF;
  IF p_destination_chain_id IS NULL OR p_destination_chain_id <= 0 THEN RAISE EXCEPTION 'invalid destination_chain_id'; END IF;
  IF v_token !~ '^0x[0-9a-f]{40}$' THEN RAISE EXCEPTION 'invalid token'; END IF;
  IF p_occurred_at IS NULL THEN RAISE EXCEPTION 'invalid occurred_at'; END IF;
  IF p_observed_at IS NULL THEN RAISE EXCEPTION 'invalid observed_at'; END IF;

  -- serialize competing writes for the same wallet + nonce and same source event
  PERFORM pg_advisory_xact_lock(hashtextextended(v_wallet || ':' || v_nonce, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_source_chain_id::text || ':' || v_tx || ':' || p_source_log_index::text, 0));

  SELECT * INTO v_row FROM public.verified_activities va
   WHERE va.source_chain_id = p_source_chain_id
     AND va.source_tx_hash = v_tx
     AND va.source_log_index = p_source_log_index;

  IF FOUND THEN
    IF v_row.activity_id <> v_activity_id
       OR v_row.user_wallet <> v_wallet
       OR v_row.kind <> v_kind
       OR v_row.amount_raw <> v_amount
       OR v_row.campaign_id <> v_campaign
       OR v_row.intent_hash <> v_intent_hash
       OR v_row.intent_nonce <> v_nonce
       OR v_row.action_type <> v_action
       OR v_row.destination_chain_id <> p_destination_chain_id
       OR v_row.token <> v_token
       OR v_row.occurred_at <> p_occurred_at THEN
      RAISE EXCEPTION 'source event already recorded with different evidence';
    END IF;
    RETURN QUERY SELECT false, v_row.activity_id;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.verified_activities va WHERE va.activity_id = v_activity_id) THEN
    RAISE EXCEPTION 'activity_id already exists for different canonical evidence';
  END IF;

  IF EXISTS (SELECT 1 FROM public.verified_activities va
              WHERE va.user_wallet = v_wallet AND va.intent_nonce = v_nonce) THEN
    RAISE EXCEPTION 'intent nonce already consumed for this wallet';
  END IF;

  IF EXISTS (SELECT 1 FROM public.verified_activities va WHERE va.intent_hash = v_intent_hash) THEN
    RAISE EXCEPTION 'intent_hash already attached to a different event';
  END IF;

  INSERT INTO public.verified_activities (
    activity_id, user_wallet, kind, source_chain_id, source_tx_hash, source_log_index,
    amount_raw, campaign_id, intent_hash, intent_nonce, status, action_type,
    destination_chain_id, token, occurred_at, observed_at
  ) VALUES (
    v_activity_id, v_wallet, v_kind, p_source_chain_id, v_tx, p_source_log_index,
    v_amount, v_campaign, v_intent_hash, v_nonce, 'CONFIRMED', v_action,
    p_destination_chain_id, v_token, p_occurred_at, p_observed_at
  );

  RETURN QUERY SELECT true, v_activity_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_record_verified_activity(text,text,text,bigint,text,integer,text,text,text,text,text,bigint,text,timestamptz,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_record_verified_activity(text,text,text,bigint,text,integer,text,text,text,text,text,bigint,text,timestamptz,timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.admin_record_verified_activity(text,text,text,bigint,text,integer,text,text,text,text,text,bigint,text,timestamptz,timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_verified_activity(text,text,text,bigint,text,integer,text,text,text,text,text,bigint,text,timestamptz,timestamptz) TO service_role;