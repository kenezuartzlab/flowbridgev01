CREATE OR REPLACE FUNCTION public.award_referral_milestone_v366(p_referrer uuid,p_referee uuid,p_milestone text,p_month text,p_day text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE award integer; why text; qualified_count integer; volume numeric; days integer; rw text; fw text;
BEGIN
 IF p_month <> to_char(now() AT TIME ZONE 'UTC','YYYY-MM') OR p_day <> to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD') THEN RAISE EXCEPTION 'current UTC reward period required'; END IF;
 SELECT wallet_address INTO rw FROM public.profiles WHERE id=p_referrer;
 SELECT wallet_address INTO fw FROM public.profiles WHERE id=p_referee;
 IF rw IS NULL OR fw IS NULL OR p_referrer=p_referee OR lower(rw)=lower(fw) THEN RETURN jsonb_build_object('granted',0); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles child JOIN public.profiles parent ON child.referred_by=parent.referral_code WHERE child.id=p_referee AND parent.id=p_referrer) THEN RAISE EXCEPTION 'verified referral relationship required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('reward-referral:'||p_referrer::text||':'||p_month,0));
 IF EXISTS(SELECT 1 FROM public.referral_milestone_awards WHERE referrer_id=p_referrer AND referee_id=p_referee AND milestone=p_milestone) THEN RETURN jsonb_build_object('granted',0); END IF;
 SELECT count(*),coalesce(sum(verified_usd),0),count(DISTINCT day_key) INTO qualified_count,volume,days FROM public.flow_points_ledger WHERE user_id=p_referee AND chain_id=677 AND reason IN ('CORE_SWAP','CORE_SWAP_V2') AND points>0 AND verified_usd>=5 AND verified_activity_id IS NOT NULL;
 IF p_milestone='FIRST_SWAP' AND qualified_count>=1 THEN award:=15;why:='REFERRAL_FIRST_QUALIFYING_SWAP';
 ELSIF p_milestone='VOLUME_100' AND volume>=100 THEN award:=35;why:='REFERRAL_100_USD_VOLUME';
 ELSIF p_milestone='ACTIVE_DAYS_3' AND days>=3 THEN award:=50;why:='REFERRAL_3_ACTIVE_DAYS';
 ELSE RETURN jsonb_build_object('granted',0); END IF;
 INSERT INTO public.referral_milestone_awards(referrer_id,referee_id,milestone,points,policy_version,month_key) VALUES(p_referrer,p_referee,p_milestone,award,'FLOW_POINTS_V2',p_month);
 INSERT INTO public.flow_points_ledger(user_id,policy_version,reason,points,base_points,day_key,activity_key,program_id,funding_state,wallet_address,metadata) VALUES(p_referrer,'FLOW_POINTS_V2',why,award,award,p_day,'milestone:'||p_referrer::text||':'||p_referee::text||':'||p_milestone,'REFERRAL_MILESTONE','UNFUNDED',lower(rw),jsonb_build_object('refereeId',p_referee,'milestone',p_milestone,'policyVersion','FLOW_POINTS_V2'));
 UPDATE public.profiles SET flow_points=flow_points+award,points_referral_activity=points_referral_activity+award WHERE id=p_referrer;
 RETURN jsonb_build_object('granted',award);
END $fn$;
REVOKE ALL ON FUNCTION public.award_referral_milestone_v366(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.award_referral_milestone_v366(uuid,uuid,text,text,text) TO service_role;