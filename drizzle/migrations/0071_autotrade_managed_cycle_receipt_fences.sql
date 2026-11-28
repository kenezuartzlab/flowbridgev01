ALTER TABLE public.autotrade_managed_intents ADD COLUMN execution_index integer NOT NULL DEFAULT 0 CHECK(execution_index BETWEEN 0 AND 3), ADD COLUMN valuation_usdt6_per_bot numeric NOT NULL DEFAULT 0, ADD COLUMN valuation_at timestamptz;
CREATE UNIQUE INDEX autotrade_managed_single_cycle_idx ON public.autotrade_managed_intents(order_id,execution_index);
ALTER TABLE public.autotrade_managed_effects ADD COLUMN receipt_block bigint, ADD COLUMN receipt_block_hash text;
CREATE VIEW public.autotrade_managed_pending WITH (security_invoker=true) AS SELECT i.* FROM public.autotrade_managed_intents i LEFT JOIN public.autotrade_managed_effects e ON e.effect_key=i.effect_key WHERE e.state IS NULL OR e.state NOT IN ('FINAL','REVERTED');
GRANT SELECT ON public.autotrade_managed_pending TO service_role;
CREATE OR REPLACE FUNCTION public.autotrade_managed_effect(_op text,_order_id uuid,_key text,_request jsonb,_fingerprint text,_holder uuid,_fencing bigint,_attempt uuid,_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.autotrade_worker_lease%ROWTYPE; i public.autotrade_managed_intents%ROWTYPE; e public.autotrade_managed_effects%ROWTYPE;
 o public.autotrade_orders%ROWTYPE; n integer; chain_nonce integer; gas_cost numeric; paused boolean; reconcile_only boolean; next_order_state text;
BEGIN
 IF _op NOT IN ('authorize','reserve','advance') OR _attempt IS NULL OR _fingerprint IS NULL OR _request IS NULL THEN RAISE EXCEPTION 'MANAGED_OPERATION_INVALID'; END IF;
 SELECT * INTO l FROM public.autotrade_worker_lease WHERE name='autotrade-main' FOR UPDATE;
 IF l.holder IS DISTINCT FROM _holder OR l.fencing IS DISTINCT FROM _fencing OR l.lease_until < now()+interval '2 seconds' THEN RAISE EXCEPTION 'FENCE_LOST'; END IF;
 SELECT emergency_paused INTO paused FROM public.autotrade_control WHERE id=true FOR UPDATE;
 SELECT * INTO o FROM public.autotrade_orders WHERE id=_order_id FOR UPDATE;
 SELECT * INTO i FROM public.autotrade_managed_intents WHERE effect_key=_key FOR UPDATE;
 IF i.effect_key IS NULL OR i.order_id<>_order_id OR i.request_json IS DISTINCT FROM _request OR i.fingerprint IS DISTINCT FROM _fingerprint OR lower(_request->>'account') IS DISTINCT FROM i.account THEN RAISE EXCEPTION 'EXACT_INTENT_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(i.account,677));
 SELECT * INTO e FROM public.autotrade_managed_effects WHERE effect_key=_key FOR UPDATE;
 IF e.effect_key IS NOT NULL AND (e.fingerprint<>_fingerprint OR e.fencing>_fencing OR e.account<>i.account) THEN RAISE EXCEPTION 'EFFECT_IDENTITY_CONFLICT'; END IF;
 reconcile_only:=e.effect_key IS NOT NULL AND e.state IN ('BROADCAST','FINAL','REVERTED');
 IF NOT reconcile_only THEN
   IF paused IS DISTINCT FROM false THEN RAISE EXCEPTION 'EMERGENCY_PAUSED'; END IF;
   IF o.id IS NULL OR o.mode<>'live' OR o.pair<>'CA/BOT' OR o.version<>i.order_version OR o.state IN ('PAUSED','FAILED','CANCELLED','COMPLETED','EXPIRED') THEN RAISE EXCEPTION 'ORDER_VERSION_OR_STATE'; END IF;
   IF NOT (i.approved AND i.infrastructure_reviewed AND i.security_reviewed AND i.gas_approved AND i.order_authorized) OR i.expires_at<=now() THEN RAISE EXCEPTION 'LIVE_APPROVALS_REQUIRED'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.autotrade_trading_accounts WHERE address=i.account AND chain_id=677 AND status='active') THEN RAISE EXCEPTION 'DEDICATED_ACCOUNT_REQUIRED'; END IF;
 END IF;
 IF _op='authorize' THEN RETURN '{}'::jsonb; END IF;
 IF _op='reserve' THEN
   IF e.effect_key IS NOT NULL THEN
     IF e.fencing=_fencing AND e.attempt<>_attempt AND e.state NOT IN ('BROADCAST','FINAL','REVERTED') THEN RAISE EXCEPTION 'EFFECT_BUSY'; END IF;
     UPDATE public.autotrade_managed_effects SET fencing=_fencing,attempt=_attempt WHERE effect_key=_key RETURNING * INTO e;
     RETURN to_jsonb(e);
   END IF;
   IF _request->>'side' IS DISTINCT FROM (ARRAY['buy','approve','sell','revoke'])[i.execution_index+1] THEN RAISE EXCEPTION 'SINGLE_CYCLE_SEQUENCE'; END IF;
   IF i.execution_index>0 AND NOT EXISTS(SELECT 1 FROM public.autotrade_managed_intents predecessor JOIN public.autotrade_managed_effects pe ON pe.effect_key=predecessor.effect_key WHERE predecessor.order_id=_order_id AND predecessor.execution_index=i.execution_index-1 AND pe.state='FINAL') THEN RAISE EXCEPTION 'PREDECESSOR_NOT_FINAL'; END IF;
   IF i.execution_index=0 AND (i.valuation_usdt6_per_bot<=0 OR i.valuation_at IS NULL OR i.valuation_at<i.created_at-interval '10 seconds' OR i.valuation_at>now() OR (_request->'call'->>'value')::numeric*i.valuation_usdt6_per_bot>i.cap_usdt6*1000000000000000000::numeric) THEN RAISE EXCEPTION 'CANARY_TRADE_CAP'; END IF;
   IF EXISTS(SELECT 1 FROM public.autotrade_managed_effects WHERE account=i.account AND state NOT IN ('FINAL','REVERTED')) THEN RAISE EXCEPTION 'OPEN_EFFECT'; END IF;
   chain_nonce:=(_patch->>'chainNonce')::integer;
   IF chain_nonce IS NULL OR chain_nonce<0 THEN RAISE EXCEPTION 'VERIFIED_NONCE_REQUIRED'; END IF;
   INSERT INTO public.autotrade_managed_nonces(account,next_nonce) VALUES(i.account,chain_nonce) ON CONFLICT DO NOTHING;
   SELECT next_nonce INTO n FROM public.autotrade_managed_nonces WHERE account=i.account FOR UPDATE;
   IF n<>chain_nonce THEN RAISE EXCEPTION 'NONCE_DIVERGENCE_REVIEW'; END IF;
   gas_cost:=(_request->>'gas')::numeric * (_request->>'maxFeePerGas')::numeric;
   IF gas_cost<=0 OR gas_cost>(_request->>'maxGasWei')::numeric OR gas_cost+coalesce((SELECT sum(gas_reservation_wei) FROM public.autotrade_managed_effects WHERE order_id=_order_id),0)>i.total_gas_cap_wei THEN RAISE EXCEPTION 'TOTAL_GAS_CAP'; END IF;
   INSERT INTO public.autotrade_managed_effects(effect_key,order_id,account,nonce,state,fingerprint,fencing,attempt,gas_reservation_wei) VALUES(_key,_order_id,i.account,n,'RESERVED',_fingerprint,_fencing,_attempt,gas_cost) RETURNING * INTO e;
   UPDATE public.autotrade_managed_nonces SET next_nonce=n+1 WHERE account=i.account;
   RETURN to_jsonb(e);
 END IF;
 IF e.effect_key IS NULL OR e.fencing<>_fencing OR e.attempt<>_attempt OR e.state IS DISTINCT FROM _patch->>'expectedState' THEN RAISE EXCEPTION 'EFFECT_CAS_LOST'; END IF;
 IF NOT ((e.state='RESERVED' AND _patch->>'state'='SIGNED') OR (e.state='SIGNED' AND _patch->>'state'='BROADCAST') OR (e.state='BROADCAST' AND _patch->>'state' IN ('FINAL','REVERTED'))) THEN RAISE EXCEPTION 'ILLEGAL_EFFECT_TRANSITION'; END IF;
 IF _patch->>'state'='SIGNED' THEN
   IF coalesce(_patch->>'raw','') !~ '^0x[0-9a-fA-F]+$' OR length(_patch->>'raw')>40000 OR coalesce(_patch->>'hash','') !~ '^0x[0-9a-fA-F]{64}$' THEN RAISE EXCEPTION 'SIGNATURE_REQUIRED'; END IF;
 ELSIF _patch->>'raw' IS DISTINCT FROM e.signed_raw OR _patch->>'hash' IS DISTINCT FROM e.tx_hash THEN RAISE EXCEPTION 'SIGNATURE_IMMUTABLE'; END IF;
 IF _patch->>'state' IN ('FINAL','REVERTED') AND ((_patch->>'actualOut') IS NULL OR (_patch->>'actualOut')::numeric<0 OR (_patch->>'receiptBlock')::bigint IS NULL OR coalesce(_patch->>'receiptBlockHash','') !~ '^0x[0-9a-fA-F]{64}$') THEN RAISE EXCEPTION 'RECEIPT_EVIDENCE_REQUIRED'; END IF;
 UPDATE public.autotrade_managed_effects SET state=_patch->>'state',signed_raw=_patch->>'raw',tx_hash=_patch->>'hash',actual_out=(_patch->>'actualOut')::numeric,receipt_block=(_patch->>'receiptBlock')::bigint,receipt_block_hash=_patch->>'receiptBlockHash',updated_at=now() WHERE effect_key=_key RETURNING * INTO e;
 IF e.state IN ('FINAL','REVERTED') THEN
   next_order_state:=CASE WHEN e.state='REVERTED' THEN 'FAILED' WHEN i.execution_index=0 THEN 'HOLDING' WHEN i.execution_index=2 THEN 'SELL_SUBMITTED' WHEN i.execution_index=3 THEN 'COMPLETED' ELSE o.state END;
   IF NOT EXISTS(SELECT 1 FROM public.autotrade_managed_effects other WHERE other.order_id=_order_id AND other.effect_key<>_key AND other.state='REVERTED') THEN
     UPDATE public.autotrade_orders SET state=next_order_state,version=version+1,
       order_json=jsonb_set(jsonb_set(order_json,'{state}',to_jsonb(next_order_state)),'{version}',to_jsonb(version+1)) || CASE WHEN i.execution_index=0 AND e.state='FINAL' THEN jsonb_build_object('acquiredBase',jsonb_build_object('$big',e.actual_out::text)) WHEN i.execution_index=2 AND e.state='FINAL' THEN jsonb_build_object('proceedsQuote',jsonb_build_object('$big',e.actual_out::text)) ELSE '{}'::jsonb END,
       last_decision=jsonb_build_object('kind','managed_effect','effect',_key,'state',e.state,'actualOut',e.actual_out),updated_at=now() WHERE id=_order_id;
     INSERT INTO public.autotrade_events(order_id,version,actor_email,event) VALUES(_order_id,o.version+1,'managed-worker',jsonb_build_object('effect',_key,'state',e.state,'actualOut',e.actual_out,'block',e.receipt_block,'blockHash',e.receipt_block_hash));
   END IF;
 END IF;
 RETURN to_jsonb(e);
END $$;
REVOKE EXECUTE ON FUNCTION public.autotrade_managed_effect(text,uuid,text,jsonb,text,uuid,bigint,uuid,jsonb) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.autotrade_managed_effect(text,uuid,text,jsonb,text,uuid,bigint,uuid,jsonb) TO service_role;