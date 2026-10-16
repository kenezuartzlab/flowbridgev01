CREATE OR REPLACE FUNCTION public.reward_v366_insert_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE used_points bigint; referee uuid; rewarded integer;
BEGIN
  IF NEW.policy_version = 'FLOW_POINTS_V2' AND NEW.reason IN ('CORE_SWAP','CORE_SWAP_V2') AND NEW.points > 0 THEN
    IF NEW.verified_activity_id IS NULL OR NEW.source_log_index IS NULL OR NEW.source_log_index < 0 OR NEW.day_key IS NULL OR NEW.wallet_address IS NULL THEN RAISE EXCEPTION 'canonical reward evidence required'; END IF;
    IF NEW.verified_usd IS NULL OR NEW.verified_usd < 5 OR NEW.points > floor(NEW.verified_usd) THEN RAISE EXCEPTION 'approved swap reward policy violated'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('reward-day:' || lower(NEW.wallet_address) || ':' || NEW.day_key, 0));
    SELECT coalesce(sum(points),0) INTO used_points FROM public.flow_points_ledger WHERE lower(wallet_address)=lower(NEW.wallet_address) AND day_key=NEW.day_key AND reason IN ('CORE_SWAP','CORE_SWAP_V2');
    IF used_points + NEW.points > 1000 THEN RAISE EXCEPTION 'daily reward cap reached; retry canonical activity'; END IF;
  END IF;
  IF NEW.reason IN ('SIGNUP_BONUS_REFEREE','REFERRAL_SIGNUP_BONUS') THEN
    IF NEW.policy_version <> 'FUNDED_SIGNUP_BONUS_V1' OR NEW.points <> 100 THEN RAISE EXCEPTION 'approved signup award policy required'; END IF;
    referee := CASE WHEN NEW.reason='SIGNUP_BONUS_REFEREE' THEN NEW.user_id ELSE (NEW.metadata->>'refereeId')::uuid END;
    IF referee IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id=referee AND email_confirmed_at IS NOT NULL AND created_at >= '2026-10-04T01:00:00Z'::timestamptz) THEN RAISE EXCEPTION 'qualifying verified signup required'; END IF;
    IF NEW.wallet_address IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=NEW.user_id AND lower(wallet_address)=lower(NEW.wallet_address)) THEN RAISE EXCEPTION 'signup award wallet must match bound wallet'; END IF;
    IF NEW.reason='REFERRAL_SIGNUP_BONUS' THEN
      IF referee=NEW.user_id THEN RAISE EXCEPTION 'self referral denied'; END IF;
      PERFORM pg_advisory_xact_lock(hashtextextended('reward-referral:' || NEW.user_id::text || ':' || to_char(now() AT TIME ZONE 'UTC','YYYY-MM'),0));
      SELECT count(DISTINCT uid) INTO rewarded FROM (
        SELECT (metadata->>'refereeId')::uuid uid FROM public.flow_points_ledger WHERE user_id=NEW.user_id AND reason='REFERRAL_SIGNUP_BONUS' AND created_at >= date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
        UNION SELECT referee_id uid FROM public.referral_milestone_awards WHERE referrer_id=NEW.user_id AND month_key=to_char(now() AT TIME ZONE 'UTC','YYYY-MM')
      ) x WHERE uid<>referee;
      IF rewarded >= 10 THEN RAISE EXCEPTION 'monthly rewarded referral cap reached'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER reward_v366_insert_guard BEFORE INSERT ON public.flow_points_ledger FOR EACH ROW EXECUTE FUNCTION public.reward_v366_insert_guard();
CREATE OR REPLACE FUNCTION public.reward_v366_milestone_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE expected integer; rewarded integer;
BEGIN
  expected := CASE NEW.milestone WHEN 'FIRST_SWAP' THEN 15 WHEN 'VOLUME_100' THEN 35 WHEN 'ACTIVE_DAYS_3' THEN 50 ELSE NULL END;
  IF NEW.policy_version <> 'FLOW_POINTS_V2' OR expected IS NULL OR NEW.points <> expected OR NEW.referrer_id=NEW.referee_id THEN RAISE EXCEPTION 'approved milestone policy required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('reward-referral:' || NEW.referrer_id::text || ':' || NEW.month_key,0));
  SELECT count(DISTINCT uid) INTO rewarded FROM (
    SELECT referee_id uid FROM public.referral_milestone_awards WHERE referrer_id=NEW.referrer_id AND month_key=NEW.month_key
    UNION SELECT (metadata->>'refereeId')::uuid uid FROM public.flow_points_ledger WHERE user_id=NEW.referrer_id AND reason='REFERRAL_SIGNUP_BONUS' AND to_char(created_at AT TIME ZONE 'UTC','YYYY-MM')=NEW.month_key
  ) x WHERE uid<>NEW.referee_id;
  IF rewarded >= 10 THEN RAISE EXCEPTION 'monthly rewarded referral cap reached'; END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER reward_v366_milestone_guard BEFORE INSERT ON public.referral_milestone_awards FOR EACH ROW EXECUTE FUNCTION public.reward_v366_milestone_guard();