-- V30.2B P2B: evidence-only canonical verified activity (receipt-verified historical swaps)

ALTER TABLE public.verified_activities
  ADD COLUMN IF NOT EXISTS evidence_source text NOT NULL DEFAULT 'SIGNED_INTENT';

ALTER TABLE public.verified_activities
  ALTER COLUMN intent_hash DROP NOT NULL,
  ALTER COLUMN intent_nonce DROP NOT NULL;

ALTER TABLE public.verified_activities
  DROP CONSTRAINT IF EXISTS verified_activities_evidence_source_chk;
ALTER TABLE public.verified_activities
  ADD CONSTRAINT verified_activities_evidence_source_chk
  CHECK (evidence_source IN ('SIGNED_INTENT', 'ROUTER_V3_RECEIPT'));

-- Signed-intent records keep their full intent identity; evidence-only records
-- must not carry fabricated intent data.
ALTER TABLE public.verified_activities
  DROP CONSTRAINT IF EXISTS verified_activities_evidence_identity_chk;
ALTER TABLE public.verified_activities
  ADD CONSTRAINT verified_activities_evidence_identity_chk
  CHECK (
    (evidence_source = 'SIGNED_INTENT' AND intent_hash IS NOT NULL AND intent_nonce IS NOT NULL)
    OR
    (evidence_source = 'ROUTER_V3_RECEIPT' AND intent_hash IS NULL AND intent_nonce IS NULL)
  );

-- ---------------------------------------------------------------------------
-- Record one receipt-verified mainnet Router v3 swap. Idempotent by canonical
-- (source_chain_id, source_tx_hash, source_log_index) identity.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_record_router_v3_swap_evidence(
  p_activity_id text,
  p_user_wallet text,
  p_source_chain_id bigint,
  p_source_tx_hash text,
  p_source_log_index integer,
  p_amount_raw numeric,
  p_action_type text,
  p_token text,
  p_occurred_at timestamptz
)
RETURNS TABLE (inserted boolean, activity_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.verified_activities;
BEGIN
  IF p_activity_id !~ '^0x[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'activity id must be a canonical 32-byte hash';
  END IF;
  IF p_user_wallet !~ '^0x[0-9a-f]{40}$' THEN
    RAISE EXCEPTION 'wallet must be a lowercase address';
  END IF;
  IF p_source_chain_id <> 677 THEN
    RAISE EXCEPTION 'router v3 receipt evidence is only canonical on chain 677';
  END IF;
  IF p_source_tx_hash !~ '^0x[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'source tx hash must be a canonical 32-byte hash';
  END IF;
  IF p_source_log_index IS NULL OR p_source_log_index < 0 THEN
    RAISE EXCEPTION 'actual receipt log index is required';
  END IF;
  IF p_amount_raw IS NULL OR p_amount_raw <= 0 THEN
    RAISE EXCEPTION 'canonical on-chain amount must be positive';
  END IF;
  IF p_action_type !~ '^0x[0-9a-f]{64}$' OR p_action_type = repeat('0', 64) THEN
    RAISE EXCEPTION 'action type must be a non-zero 32-byte tag';
  END IF;
  IF p_token !~ '^0x[0-9a-f]{40}$' THEN
    RAISE EXCEPTION 'token must be a lowercase address';
  END IF;

  SELECT * INTO v_existing
  FROM public.verified_activities
  WHERE source_chain_id = p_source_chain_id
    AND lower(source_tx_hash) = lower(p_source_tx_hash)
    AND source_log_index = p_source_log_index;

  IF FOUND THEN
    IF v_existing.activity_id <> p_activity_id
       OR v_existing.amount_raw::numeric <> p_amount_raw
       OR lower(v_existing.user_wallet) <> lower(p_user_wallet) THEN
      RAISE EXCEPTION 'canonical identity conflict for %:%:%',
        p_source_chain_id, p_source_tx_hash, p_source_log_index;
    END IF;
    RETURN QUERY SELECT false, v_existing.activity_id;
    RETURN;
  END IF;

  INSERT INTO public.verified_activities (
    activity_id, user_wallet, kind, status,
    source_chain_id, destination_chain_id, source_tx_hash, source_log_index,
    amount_raw, token, action_type, campaign_id,
    intent_hash, intent_nonce, evidence_source, occurred_at, observed_at
  ) VALUES (
    p_activity_id, lower(p_user_wallet), 'SWAP_EXECUTED', 'CONFIRMED',
    p_source_chain_id, p_source_chain_id, lower(p_source_tx_hash), p_source_log_index,
    p_amount_raw, lower(p_token), p_action_type, '0x' || repeat('0', 64),
    NULL, NULL, 'ROUTER_V3_RECEIPT', p_occurred_at, now()
  );

  RETURN QUERY SELECT true, p_activity_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_record_router_v3_swap_evidence(
  text, text, bigint, text, integer, numeric, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_router_v3_swap_evidence(
  text, text, bigint, text, integer, numeric, text, text, timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- Bind an existing CORE_SWAP points-history row to its canonical verified
-- activity. Zero economic delta: points and base_points are never touched.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_bind_core_swap_evidence(
  p_chain_id bigint,
  p_tx_hash text,
  p_source_log_index integer,
  p_activity_id text
)
RETURNS TABLE (bound boolean, ledger_id uuid, points integer, base_points integer, activity_key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_activity public.verified_activities;
  v_rows integer;
  v_row public.flow_points_ledger;
  v_key text;
BEGIN
  SELECT * INTO v_activity
  FROM public.verified_activities
  WHERE activity_id = p_activity_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no canonical verified activity % exists', p_activity_id;
  END IF;
  IF v_activity.source_chain_id <> p_chain_id
     OR lower(v_activity.source_tx_hash) <> lower(p_tx_hash)
     OR v_activity.source_log_index <> p_source_log_index THEN
    RAISE EXCEPTION 'verified activity % does not match the requested canonical identity', p_activity_id;
  END IF;

  v_key := p_chain_id || ':' || lower(p_tx_hash) || ':' || p_source_log_index;

  SELECT count(*) INTO v_rows
  FROM public.flow_points_ledger
  WHERE chain_id = p_chain_id
    AND lower(tx_hash) = lower(p_tx_hash)
    AND reason = 'CORE_SWAP';
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'ledger collision: % CORE_SWAP rows for %:%', v_rows, p_chain_id, p_tx_hash;
  END IF;

  SELECT * INTO v_row
  FROM public.flow_points_ledger
  WHERE chain_id = p_chain_id
    AND lower(tx_hash) = lower(p_tx_hash)
    AND reason = 'CORE_SWAP';

  IF lower(v_row.wallet_address) <> lower(v_activity.user_wallet) THEN
    RAISE EXCEPTION 'ledger wallet does not match the canonical on-chain actor';
  END IF;

  IF v_row.verified_activity_id IS NOT NULL THEN
    IF v_row.verified_activity_id <> p_activity_id THEN
      RAISE EXCEPTION 'ledger row % is already bound to a different verified activity', v_row.id;
    END IF;
    RETURN QUERY SELECT false, v_row.id, v_row.points, v_row.base_points, v_row.activity_key;
    RETURN;
  END IF;

  UPDATE public.flow_points_ledger
  SET verified_activity_id = p_activity_id,
      source_log_index = p_source_log_index,
      activity_key = v_key
  WHERE id = v_row.id
    AND points = v_row.points
    AND base_points = v_row.base_points;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ledger row % changed during binding — aborted', v_row.id;
  END IF;

  SELECT * INTO v_row FROM public.flow_points_ledger WHERE id = v_row.id;
  RETURN QUERY SELECT true, v_row.id, v_row.points, v_row.base_points, v_row.activity_key;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_bind_core_swap_evidence(bigint, text, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_bind_core_swap_evidence(bigint, text, integer, text) TO service_role;