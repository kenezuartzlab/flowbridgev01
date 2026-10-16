CREATE OR REPLACE FUNCTION public.bind_referral_v367(p_user uuid, p_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE me record; ref record; created timestamptz; confirmed timestamptz; proof text; existing record; outcome text; why text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('referral-bind:'||p_user::text,0));
  SELECT id, referred_by, referral_code, wallet_address INTO me FROM public.profiles WHERE id=p_user FOR UPDATE;
  IF me.id IS NULL THEN RETURN jsonb_build_object('outcome','PENDING','reason','NO_PROFILE'); END IF;
  SELECT * INTO existing FROM public.referral_attributions WHERE user_id=p_user;
  SELECT id, wallet_address INTO ref FROM public.profiles WHERE referral_code=upper(trim(p_code));
  IF existing.user_id IS NOT NULL OR me.referred_by IS NOT NULL THEN
    outcome := 'ALREADY_ATTRIBUTED';
    why := CASE WHEN ref.id IS NOT NULL AND ref.id IS DISTINCT FROM existing.referrer_id THEN 'CONFLICT_IGNORED' ELSE 'SAME_REFERRER' END;
  ELSIF ref.id IS NULL THEN outcome:='REJECTED'; why:='INVALID_CODE';
  ELSIF ref.id = p_user THEN outcome:='REJECTED'; why:='SELF_REFERRAL';
  ELSE
    SELECT created_at, email_confirmed_at INTO created, confirmed FROM auth.users WHERE id=p_user;
    IF created IS NULL OR created < now() - interval '30 days' THEN outcome:='REJECTED'; why:='EXISTING_ACCOUNT';
    ELSIF me.wallet_address IS NOT NULL AND ref.wallet_address IS NOT NULL AND lower(me.wallet_address)=lower(ref.wallet_address) THEN outcome:='REJECTED'; why:='SELF_REFERRAL_WALLET';
    ELSIF me.wallet_address IS NOT NULL AND EXISTS (SELECT 1 FROM public.flow_points_ledger WHERE lower(wallet_address)=lower(me.wallet_address) AND user_id<>p_user) THEN outcome:='REJECTED'; why:='RECYCLED_WALLET';
    ELSE
      proof := CASE WHEN confirmed IS NOT NULL THEN 'VERIFIED_EMAIL' WHEN me.wallet_address IS NOT NULL THEN 'SIGNED_WALLET' ELSE NULL END;
      IF proof IS NULL THEN RETURN jsonb_build_object('outcome','PENDING','reason','OWNERSHIP_PROOF_REQUIRED'); END IF;
      INSERT INTO public.referral_attributions(user_id,referrer_id,referral_code,proof) VALUES (p_user,ref.id,upper(trim(p_code)),proof);
      PERFORM set_config('app.bypass_profile_guard','on',true);
      UPDATE public.profiles SET referred_by=upper(trim(p_code)) WHERE id=p_user;
      outcome:='ATTRIBUTED'; why:=proof;
    END IF;
  END IF;
  INSERT INTO public.referral_attribution_events(user_id,referrer_id,outcome,reason,proof) VALUES (p_user, coalesce(existing.referrer_id, ref.id), outcome, why, proof);
  RETURN jsonb_build_object('outcome',outcome,'reason',why);
END $fn$;
REVOKE ALL ON FUNCTION public.bind_referral_v367(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bind_referral_v367(uuid,text) TO service_role;