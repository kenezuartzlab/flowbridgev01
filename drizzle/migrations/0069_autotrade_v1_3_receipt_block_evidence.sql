CREATE OR REPLACE FUNCTION public.autotrade_paper_advance_effect(
  _order_id uuid,
  _expected_version integer,
  _key text,
  _patch jsonb,
  _next_order jsonb,
  _event jsonb,
  _decision jsonb,
  _require_unpaused boolean,
  _holder uuid,
  _fencing bigint
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l public.autotrade_worker_lease%ROWTYPE;
  o public.autotrade_orders%ROWTYPE;
  e public.autotrade_outbox%ROWTYPE;
  next_state text := _patch->>'state';
  is_paused boolean;
BEGIN
  SELECT * INTO l FROM public.autotrade_worker_lease WHERE name = 'autotrade-main' FOR UPDATE;
  IF l.holder IS DISTINCT FROM _holder OR l.fencing <> _fencing OR l.lease_until < now() + interval '2 seconds' THEN
    RAISE EXCEPTION 'FENCE_LOST';
  END IF;
  SELECT emergency_paused INTO is_paused FROM public.autotrade_control WHERE id = true;
  IF is_paused IS NULL OR (_require_unpaused AND is_paused) THEN RAISE EXCEPTION 'EMERGENCY_PAUSED'; END IF;
  SELECT * INTO o FROM public.autotrade_orders WHERE id = _order_id FOR UPDATE;
  IF o.id IS NULL OR o.mode <> 'paper' OR o.version <> _expected_version THEN RAISE EXCEPTION 'ORDER_VERSION'; END IF;
  SELECT * INTO e FROM public.autotrade_outbox WHERE idempotency_key = _key AND order_id = _order_id FOR UPDATE;
  IF e.idempotency_key IS NULL OR e.chain_id <> -677 OR e.account <> 'paper-autotrade-v1' OR e.fencing IS NULL OR e.fencing > _fencing THEN
    RAISE EXCEPTION 'EFFECT_FENCE';
  END IF;
  IF next_state IS NULL OR NOT (
    next_state = e.state OR
    (e.state = 'RESERVED' AND next_state = 'SIGNED') OR
    (e.state = 'SIGNED' AND next_state = 'BROADCAST') OR
    (e.state = 'BROADCAST' AND next_state IN ('MINED','REVERTED','REPLACED')) OR
    (e.state = 'MINED' AND next_state IN ('FINAL','BROADCAST'))
  ) THEN RAISE EXCEPTION 'ILLEGAL_EFFECT_TRANSITION'; END IF;
  IF _next_order IS NOT NULL THEN
    IF (_next_order->>'id')::uuid <> _order_id OR (_next_order->>'version')::integer <> _expected_version + 1 OR _next_order->'spec'->>'mode' <> 'paper' THEN
      RAISE EXCEPTION 'NEXT_ORDER_INVALID';
    END IF;
    UPDATE public.autotrade_orders SET
      order_json = _next_order,
      state = _next_order->>'state',
      version = _expected_version + 1,
      last_decision = coalesce(_decision, last_decision),
      updated_at = now()
    WHERE id = _order_id AND version = _expected_version;
    INSERT INTO public.autotrade_events (order_id, version, actor_email, event)
    VALUES (_order_id, _expected_version + 1, 'worker:' || _holder::text, coalesce(_event, '{}'::jsonb));
  ELSIF _decision IS NOT NULL THEN
    UPDATE public.autotrade_orders SET last_decision = _decision, updated_at = now()
    WHERE id = _order_id AND version = _expected_version;
  END IF;
  UPDATE public.autotrade_outbox SET
    state = next_state,
    tx_hash = coalesce(_patch->>'txHash', tx_hash),
    signed_raw = coalesce(_patch->>'signedRaw', signed_raw),
    mined_block = CASE WHEN next_state IN ('MINED','FINAL') THEN coalesce((_patch->>'minedBlock')::bigint, mined_block, 1) ELSE mined_block END,
    mined_hash = CASE WHEN next_state IN ('MINED','FINAL') THEN coalesce(_patch->>'minedHash', mined_hash, tx_hash) ELSE mined_hash END,
    updated_at = now()
  WHERE idempotency_key = _key;
END $$;
REVOKE EXECUTE ON FUNCTION public.autotrade_paper_advance_effect(uuid,integer,text,jsonb,jsonb,jsonb,jsonb,boolean,uuid,bigint) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.autotrade_paper_advance_effect(uuid,integer,text,jsonb,jsonb,jsonb,jsonb,boolean,uuid,bigint) TO service_role;