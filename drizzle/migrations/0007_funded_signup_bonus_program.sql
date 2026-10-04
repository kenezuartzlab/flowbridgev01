CREATE TABLE public.reward_budgets (
  program_id text PRIMARY KEY,
  total_points bigint NOT NULL DEFAULT 0 CHECK (total_points >= 0),
  reserved_points bigint NOT NULL DEFAULT 0 CHECK (reserved_points >= 0),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED')),
  funding_verified boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reward_budgets_no_overdraw CHECK (reserved_points <= total_points),
  CONSTRAINT reward_budgets_program_chk CHECK (program_id IN ('SIGNUP_BONUS','CORE_SWAP','REFERRAL_MILESTONE','OTHER'))
);
GRANT ALL ON public.reward_budgets TO service_role;
ALTER TABLE public.reward_budgets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.reward_reservations (
  reservation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id text NOT NULL REFERENCES public.reward_budgets(program_id),
  ledger_id uuid NOT NULL UNIQUE REFERENCES public.flow_points_ledger(id),
  user_id uuid NOT NULL,
  wallet_address text,
  points integer NOT NULL CHECK (points > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.reward_reservations TO service_role;
ALTER TABLE public.reward_reservations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.reward_budget_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id text NOT NULL REFERENCES public.reward_budgets(program_id),
  delta_points bigint NOT NULL CHECK (delta_points > 0),
  actor_email text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.reward_budget_events TO service_role;
ALTER TABLE public.reward_budget_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.flow_points_ledger
  ADD COLUMN program_id text,
  ADD COLUMN reservation_id uuid,
  ADD COLUMN funding_state text NOT NULL DEFAULT 'UNFUNDED',
  ADD COLUMN referrer_id uuid;
ALTER TABLE public.flow_points_ledger ADD CONSTRAINT flow_points_ledger_funding_state_chk
  CHECK (funding_state IN ('FUNDED','UNFUNDED','REVIEW'));

ALTER TABLE public.flow_points_ledger DROP CONSTRAINT flow_points_ledger_reason_chk;
ALTER TABLE public.flow_points_ledger ADD CONSTRAINT flow_points_ledger_reason_chk CHECK (reason = ANY (ARRAY[
  'CORE_SWAP','CORE_SWAP_V2','DAILY_CAP_REACHED','REFERRAL_FIRST_QUALIFYING_SWAP','REFERRAL_100_USD_VOLUME',
  'REFERRAL_3_ACTIVE_DAYS','REFERRAL_MILESTONE_FIRST_SWAP','REFERRAL_MILESTONE_VOLUME_100',
  'REFERRAL_MILESTONE_ACTIVE_DAYS_3','REFERRAL_MONTHLY_CAP_REACHED','ANTI_ABUSE_REVIEW','PRICING_REVIEW',
  'SIGNUP_BONUS_REFEREE','REFERRAL_SIGNUP_BONUS','ADMIN_ADJUSTMENT','SIGNUP_BONUS_EXHAUSTED']));

CREATE UNIQUE INDEX flow_points_ledger_signup_user_uidx ON public.flow_points_ledger (user_id)
  WHERE reason = 'SIGNUP_BONUS_REFEREE';
CREATE UNIQUE INDEX flow_points_ledger_signup_wallet_uidx ON public.flow_points_ledger (lower(wallet_address))
  WHERE reason = 'SIGNUP_BONUS_REFEREE';

-- Legacy direct signup credit (+50 straight into the profile aggregate) is retired.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  new_code TEXT;
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  i INT;
BEGIN
  new_code := 'FB-';
  FOR i IN 1..5 LOOP
    new_code := new_code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  END LOOP;
  INSERT INTO public.profiles (id, email, referral_code, flow_points, points_self)
  VALUES (NEW.id, COALESCE(NEW.email, ''), new_code, 0, 0)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- Atomic: lock budget, check headroom, write ledger + reservation together.
CREATE OR REPLACE FUNCTION public.award_signup_bonus(
  p_user_id uuid, p_wallet text, p_referrer_id uuid, p_pay_referrer boolean,
  p_policy_version text, p_bonus integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  b public.reward_budgets%ROWTYPE;
  need integer;
  w text := lower(p_wallet);
  ref_wallet text;
  l1 uuid; l2 uuid; r1 uuid; r2 uuid;
  day text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD');
BEGIN
  IF p_bonus <> 100 THEN RAISE EXCEPTION 'unsupported bonus amount'; END IF;
  IF w IS NULL OR w !~ '^0x[0-9a-f]{40}$' THEN RETURN jsonb_build_object('outcome','NO_WALLET'); END IF;
  SELECT * INTO b FROM public.reward_budgets WHERE program_id = 'SIGNUP_BONUS' FOR UPDATE;
  IF NOT FOUND OR b.status <> 'ACTIVE' THEN RETURN jsonb_build_object('outcome','PROGRAM_INACTIVE'); END IF;
  IF EXISTS (SELECT 1 FROM public.flow_points_ledger WHERE reason='SIGNUP_BONUS_REFEREE'
             AND (user_id = p_user_id OR lower(wallet_address) = w)) THEN
    RETURN jsonb_build_object('outcome','DUPLICATE');
  END IF;
  IF p_pay_referrer THEN
    IF p_referrer_id IS NULL OR p_referrer_id = p_user_id THEN RETURN jsonb_build_object('outcome','SELF_REFERRAL'); END IF;
    SELECT lower(wallet_address) INTO ref_wallet FROM public.profiles WHERE id = p_referrer_id;
    IF ref_wallet = w THEN RETURN jsonb_build_object('outcome','SELF_REFERRAL'); END IF;
    IF EXISTS (SELECT 1 FROM public.flow_points_ledger WHERE reason='REFERRAL_SIGNUP_BONUS'
               AND activity_key = 'signup-ref:' || p_user_id::text) THEN
      RETURN jsonb_build_object('outcome','DUPLICATE');
    END IF;
  END IF;
  need := p_bonus * (CASE WHEN p_pay_referrer THEN 2 ELSE 1 END);
  IF b.total_points - b.reserved_points < need THEN
    RETURN jsonb_build_object('outcome','EXHAUSTED','remaining', b.total_points - b.reserved_points,'required',need);
  END IF;

  INSERT INTO public.flow_points_ledger (user_id, policy_version, reason, points, base_points, wallet_address,
    day_key, activity_key, program_id, funding_state, referrer_id, metadata)
  VALUES (p_user_id, p_policy_version, 'SIGNUP_BONUS_REFEREE', p_bonus, p_bonus, w, day,
    'signup:' || p_user_id::text, 'SIGNUP_BONUS', 'FUNDED', p_referrer_id,
    jsonb_build_object('policyVersion', p_policy_version, 'programId', 'SIGNUP_BONUS'))
  RETURNING id INTO l1;
  INSERT INTO public.reward_reservations (program_id, ledger_id, user_id, wallet_address, points)
  VALUES ('SIGNUP_BONUS', l1, p_user_id, w, p_bonus) RETURNING reservation_id INTO r1;
  UPDATE public.flow_points_ledger SET reservation_id = r1 WHERE id = l1;

  IF p_pay_referrer THEN
    INSERT INTO public.flow_points_ledger (user_id, policy_version, reason, points, base_points, wallet_address,
      day_key, activity_key, program_id, funding_state, referrer_id, metadata)
    VALUES (p_referrer_id, p_policy_version, 'REFERRAL_SIGNUP_BONUS', p_bonus, p_bonus, ref_wallet, day,
      'signup-ref:' || p_user_id::text, 'SIGNUP_BONUS', 'FUNDED', p_referrer_id,
      jsonb_build_object('policyVersion', p_policy_version, 'programId', 'SIGNUP_BONUS', 'refereeId', p_user_id))
    RETURNING id INTO l2;
    INSERT INTO public.reward_reservations (program_id, ledger_id, user_id, wallet_address, points)
    VALUES ('SIGNUP_BONUS', l2, p_referrer_id, ref_wallet, p_bonus) RETURNING reservation_id INTO r2;
    UPDATE public.flow_points_ledger SET reservation_id = r2 WHERE id = l2;
  END IF;

  UPDATE public.reward_budgets SET reserved_points = reserved_points + need, updated_at = now()
  WHERE program_id = 'SIGNUP_BONUS';
  RETURN jsonb_build_object('outcome','CONFIRMED','reserved',need,'refereeLedgerId',l1,'referrerLedgerId',l2);
END;
$$;
REVOKE ALL ON FUNCTION public.award_signup_bonus(uuid,text,uuid,boolean,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_signup_bonus(uuid,text,uuid,boolean,text,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.increase_reward_budget(p_program text, p_delta bigint, p_actor_email text, p_reason text)
RETURNS public.reward_budgets LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r public.reward_budgets%ROWTYPE;
BEGIN
  IF p_delta IS NULL OR p_delta <= 0 THEN RAISE EXCEPTION 'budget increase must be positive'; END IF;
  IF coalesce(length(trim(p_reason)),0) = 0 OR coalesce(length(trim(p_actor_email)),0) = 0 THEN
    RAISE EXCEPTION 'actor and reason required';
  END IF;
  UPDATE public.reward_budgets SET total_points = total_points + p_delta, updated_at = now()
  WHERE program_id = p_program RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown program'; END IF;
  INSERT INTO public.reward_budget_events (program_id, delta_points, actor_email, reason)
  VALUES (p_program, p_delta, p_actor_email, p_reason);
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.increase_reward_budget(text,bigint,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increase_reward_budget(text,bigint,text,text) TO service_role;