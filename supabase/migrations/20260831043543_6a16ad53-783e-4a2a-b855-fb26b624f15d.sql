DROP FUNCTION IF EXISTS public.admin_bind_core_swap_evidence(bigint, text, integer, text);

CREATE FUNCTION public.admin_bind_core_swap_evidence(
  p_chain_id bigint,
  p_tx_hash text,
  p_source_log_index integer,
  p_activity_id text
)
RETURNS TABLE (out_bound boolean, out_ledger_id uuid, out_points integer, out_base_points integer, out_activity_key text)
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
  FROM public.flow_points_ledger l
  WHERE l.chain_id = p_chain_id
    AND lower(l.tx_hash) = lower(p_tx_hash)
    AND l.reason = 'CORE_SWAP';
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'ledger collision: % CORE_SWAP rows for %:%', v_rows, p_chain_id, p_tx_hash;
  END IF;

  SELECT l.* INTO v_row
  FROM public.flow_points_ledger l
  WHERE l.chain_id = p_chain_id
    AND lower(l.tx_hash) = lower(p_tx_hash)
    AND l.reason = 'CORE_SWAP';

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

  UPDATE public.flow_points_ledger l
  SET verified_activity_id = p_activity_id,
      source_log_index = p_source_log_index,
      activity_key = v_key
  WHERE l.id = v_row.id
    AND l.points = v_row.points
    AND l.base_points = v_row.base_points;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ledger row % changed during binding — aborted', v_row.id;
  END IF;

  SELECT l.* INTO v_row FROM public.flow_points_ledger l WHERE l.id = v_row.id;
  RETURN QUERY SELECT true, v_row.id, v_row.points, v_row.base_points, v_row.activity_key;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_bind_core_swap_evidence(bigint, text, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_bind_core_swap_evidence(bigint, text, integer, text) TO service_role;