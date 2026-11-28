CREATE TABLE public.autotrade_managed_intents (
 effect_key text PRIMARY KEY CHECK(length(effect_key) BETWEEN 1 AND 200), order_id uuid NOT NULL REFERENCES public.autotrade_orders(id),
 account text NOT NULL CHECK(account = lower(account) AND account ~ '^0x[0-9a-f]{40}$'), request_json jsonb NOT NULL, fingerprint text NOT NULL,
 order_version integer NOT NULL, expires_at timestamptz NOT NULL, approved boolean NOT NULL DEFAULT false,
 infrastructure_reviewed boolean NOT NULL DEFAULT false, security_reviewed boolean NOT NULL DEFAULT false,
 gas_approved boolean NOT NULL DEFAULT false, order_authorized boolean NOT NULL DEFAULT false,
 cap_usdt6 bigint NOT NULL CHECK(cap_usdt6 > 0 AND cap_usdt6 <= 5000000), total_gas_cap_wei numeric NOT NULL CHECK(total_gas_cap_wei > 0),
 created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.autotrade_managed_intents TO service_role;
ALTER TABLE public.autotrade_managed_intents ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.autotrade_managed_nonces (
 account text PRIMARY KEY REFERENCES public.autotrade_trading_accounts(address), next_nonce integer NOT NULL CHECK(next_nonce >= 0));
GRANT ALL ON public.autotrade_managed_nonces TO service_role;
ALTER TABLE public.autotrade_managed_nonces ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.autotrade_managed_effects (
 effect_key text PRIMARY KEY REFERENCES public.autotrade_managed_intents(effect_key), order_id uuid NOT NULL REFERENCES public.autotrade_orders(id),
 account text NOT NULL REFERENCES public.autotrade_trading_accounts(address), nonce integer NOT NULL CHECK(nonce >= 0),
 state text NOT NULL CHECK(state IN ('RESERVED','SIGNED','BROADCAST','FINAL','REVERTED')), signed_raw text, tx_hash text, actual_out numeric,
 fingerprint text NOT NULL, fencing bigint NOT NULL, attempt uuid NOT NULL, gas_reservation_wei numeric NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(account,nonce));
GRANT ALL ON public.autotrade_managed_effects TO service_role;
ALTER TABLE public.autotrade_managed_effects ENABLE ROW LEVEL SECURITY;
CREATE INDEX autotrade_managed_intents_order_idx ON public.autotrade_managed_intents(order_id);
CREATE INDEX autotrade_managed_effects_order_idx ON public.autotrade_managed_effects(order_id);
CREATE OR REPLACE FUNCTION public.autotrade_managed_effect(_op text,_order_id uuid,_key text,_request jsonb,_fingerprint text,_holder uuid,_fencing bigint,_attempt uuid,_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.autotrade_worker_lease%ROWTYPE; i public.autotrade_managed_intents%ROWTYPE; e public.autotrade_managed_effects%ROWTYPE;
 o public.autotrade_orders%ROWTYPE; n integer; chain_nonce integer; gas_cost numeric; paused boolean;
BEGIN
 IF _op NOT IN ('authorize','reserve','advance') OR _attempt IS NULL OR _fingerprint IS NULL OR _request IS NULL THEN RAISE EXCEPTION 'MANAGED_OPERATION_INVALID'; END IF;
 SELECT * INTO l FROM public.autotrade_worker_lease WHERE name='autotrade-main' FOR UPDATE;
 IF l.holder IS DISTINCT FROM _holder OR l.fencing IS DISTINCT FROM _fencing OR l.lease_until < now()+interval '2 seconds' THEN RAISE EXCEPTION 'FENCE_LOST'; END IF;
 SELECT emergency_paused INTO paused FROM public.autotrade_control WHERE id=true FOR UPDATE;
 IF paused IS DISTINCT FROM false THEN RAISE EXCEPTION 'EMERGENCY_PAUSED'; END IF;
 SELECT * INTO o FROM public.autotrade_orders WHERE id=_order_id FOR UPDATE;
 SELECT * INTO i FROM public.autotrade_managed_intents WHERE effect_key=_key FOR UPDATE;
 IF i.effect_key IS NULL OR i.order_id<>_order_id OR i.request_json IS DISTINCT FROM _request OR i.fingerprint IS DISTINCT FROM _fingerprint OR lower(_request->>'account') IS DISTINCT FROM i.account THEN RAISE EXCEPTION 'EXACT_INTENT_REQUIRED'; END IF;
 IF o.id IS NULL OR o.mode<>'live' OR o.pair<>'CA/BOT' OR o.version<>i.order_version OR o.state IN ('PAUSED','FAILED','CANCELLED','COMPLETED') THEN RAISE EXCEPTION 'ORDER_VERSION_OR_STATE'; END IF;
 IF NOT (i.approved AND i.infrastructure_reviewed AND i.security_reviewed AND i.gas_approved AND i.order_authorized) OR i.expires_at<=now() THEN RAISE EXCEPTION 'LIVE_APPROVALS_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.autotrade_trading_accounts WHERE address=i.account AND chain_id=677 AND status='active') THEN RAISE EXCEPTION 'DEDICATED_ACCOUNT_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(i.account,677));
 SELECT * INTO e FROM public.autotrade_managed_effects WHERE effect_key=_key FOR UPDATE;
 IF e.effect_key IS NOT NULL AND (e.fingerprint<>_fingerprint OR e.fencing>_fencing OR e.account<>i.account) THEN RAISE EXCEPTION 'EFFECT_IDENTITY_CONFLICT'; END IF;
 IF _op='authorize' THEN RETURN '{}'::jsonb; END IF;
 IF _op='reserve' THEN
   IF e.effect_key IS NOT NULL THEN
     IF e.fencing=_fencing AND e.attempt<>_attempt THEN RAISE EXCEPTION 'EFFECT_BUSY'; END IF;
     UPDATE public.autotrade_managed_effects SET fencing=_fencing,attempt=_attempt WHERE effect_key=_key RETURNING * INTO e;
     RETURN to_jsonb(e);
   END IF;
   IF EXISTS(SELECT 1 FROM public.autotrade_managed_effects WHERE account=i.account AND state NOT IN ('FINAL','REVERTED')) THEN RAISE EXCEPTION 'OPEN_EFFECT'; END IF;
   chain_nonce:=(_patch->>'chainNonce')::integer;
   IF chain_nonce IS NULL OR chain_nonce<0 THEN RAISE EXCEPTION 'VERIFIED_NONCE_REQUIRED'; END IF;
   INSERT INTO public.autotrade_managed_nonces(account,next_nonce) VALUES(i.account,chain_nonce) ON CONFLICT DO NOTHING;
   SELECT next_nonce INTO n FROM public.autotrade_managed_nonces WHERE account=i.account FOR UPDATE;
   IF n<>chain_nonce THEN RAISE EXCEPTION 'NONCE_DIVERGENCE_REVIEW'; END IF;
   gas_cost:=(_request->>'gas')::numeric * (_request->>'maxFeePerGas')::numeric;
   IF gas_cost<=0 OR gas_cost>( _request->>'maxGasWei')::numeric OR gas_cost+coalesce((SELECT sum(gas_reservation_wei) FROM public.autotrade_managed_effects WHERE order_id=_order_id),0)>i.total_gas_cap_wei THEN RAISE EXCEPTION 'TOTAL_GAS_CAP'; END IF;
   INSERT INTO public.autotrade_managed_effects(effect_key,order_id,account,nonce,state,fingerprint,fencing,attempt,gas_reservation_wei) VALUES(_key,_order_id,i.account,n,'RESERVED',_fingerprint,_fencing,_attempt,gas_cost) RETURNING * INTO e;
   UPDATE public.autotrade_managed_nonces SET next_nonce=n+1 WHERE account=i.account;
   RETURN to_jsonb(e);
 END IF;
 IF e.effect_key IS NULL OR e.fencing<>_fencing OR e.attempt<>_attempt OR e.state IS DISTINCT FROM _patch->>'expectedState' THEN RAISE EXCEPTION 'EFFECT_CAS_LOST'; END IF;
 IF NOT ((e.state='RESERVED' AND _patch->>'state'='SIGNED') OR (e.state='SIGNED' AND _patch->>'state'='BROADCAST') OR (e.state='BROADCAST' AND _patch->>'state' IN ('FINAL','REVERTED'))) THEN RAISE EXCEPTION 'ILLEGAL_EFFECT_TRANSITION'; END IF;
 IF _patch->>'state'='SIGNED' THEN
   IF coalesce(_patch->>'raw','') !~ '^0x[0-9a-fA-F]+$' OR length(_patch->>'raw')>40000 OR coalesce(_patch->>'hash','') !~ '^0x[0-9a-fA-F]{64}$' THEN RAISE EXCEPTION 'SIGNATURE_REQUIRED'; END IF;
 ELSIF _patch->>'raw' IS DISTINCT FROM e.signed_raw OR _patch->>'hash' IS DISTINCT FROM e.tx_hash THEN RAISE EXCEPTION 'SIGNATURE_IMMUTABLE'; END IF;
 IF _patch->>'state' IN ('FINAL','REVERTED') AND ((_patch->>'actualOut') IS NULL OR (_patch->>'actualOut')::numeric<0) THEN RAISE EXCEPTION 'RECEIPT_OUTPUT_REQUIRED'; END IF;
 UPDATE public.autotrade_managed_effects SET state=_patch->>'state',signed_raw=_patch->>'raw',tx_hash=_patch->>'hash',actual_out=(_patch->>'actualOut')::numeric,updated_at=now() WHERE effect_key=_key RETURNING * INTO e;
 UPDATE public.autotrade_orders SET last_decision=jsonb_build_object('kind','managed_effect','effect',_key,'state',e.state,'actualOut',e.actual_out),updated_at=now() WHERE id=_order_id;
 RETURN to_jsonb(e);
END $$;
REVOKE EXECUTE ON FUNCTION public.autotrade_managed_effect(text,uuid,text,jsonb,text,uuid,bigint,uuid,jsonb) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.autotrade_managed_effect(text,uuid,text,jsonb,text,uuid,bigint,uuid,jsonb) TO service_role;