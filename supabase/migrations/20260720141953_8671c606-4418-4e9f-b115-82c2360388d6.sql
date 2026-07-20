
-- 1. Fix trigger: allow bypass when running as service_role regardless of JWT format
CREATE OR REPLACE FUNCTION public.prevent_protected_profile_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- service_role bypasses this guard. Check both JWT claim (legacy) and
  -- current_user (new sb_secret_* keys route through role switch, not JWT).
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR current_user = 'service_role'
     OR session_user = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'id is immutable'; END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN RAISE EXCEPTION 'email cannot be changed from client'; END IF;
  IF NEW.flow_points IS DISTINCT FROM OLD.flow_points THEN RAISE EXCEPTION 'flow_points is server-controlled'; END IF;
  IF NEW.claimed_tokens IS DISTINCT FROM OLD.claimed_tokens THEN RAISE EXCEPTION 'claimed_tokens is server-controlled'; END IF;
  IF NEW.binding_changes_count IS DISTINCT FROM OLD.binding_changes_count THEN RAISE EXCEPTION 'binding_changes_count is server-controlled'; END IF;
  IF NEW.last_binding_change IS DISTINCT FROM OLD.last_binding_change THEN RAISE EXCEPTION 'last_binding_change is server-controlled'; END IF;
  IF NEW.referral_code IS DISTINCT FROM OLD.referral_code THEN RAISE EXCEPTION 'referral_code is server-controlled'; END IF;
  IF NEW.referred_by IS DISTINCT FROM OLD.referred_by THEN RAISE EXCEPTION 'referred_by is server-controlled'; END IF;
  IF NEW.wallet_address IS DISTINCT FROM OLD.wallet_address THEN RAISE EXCEPTION 'wallet_address must be updated via the bind-wallet server function'; END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'created_at is immutable'; END IF;

  RETURN NEW;
END;
$function$;

-- 2. Split FLOW points into buckets + track swap volume
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS points_self integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS points_referral_activity integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS points_referral_signup integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_swap_volume_usd numeric NOT NULL DEFAULT 0;

-- Backfill: seed existing balances into points_self so nobody is penalized.
UPDATE public.profiles
  SET points_self = flow_points
  WHERE points_self = 0 AND flow_points > 0;

-- Extend guard to also protect the new columns
CREATE OR REPLACE FUNCTION public.prevent_protected_profile_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR current_user = 'service_role'
     OR session_user = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'id is immutable'; END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN RAISE EXCEPTION 'email cannot be changed from client'; END IF;
  IF NEW.flow_points IS DISTINCT FROM OLD.flow_points THEN RAISE EXCEPTION 'flow_points is server-controlled'; END IF;
  IF NEW.claimed_tokens IS DISTINCT FROM OLD.claimed_tokens THEN RAISE EXCEPTION 'claimed_tokens is server-controlled'; END IF;
  IF NEW.binding_changes_count IS DISTINCT FROM OLD.binding_changes_count THEN RAISE EXCEPTION 'binding_changes_count is server-controlled'; END IF;
  IF NEW.last_binding_change IS DISTINCT FROM OLD.last_binding_change THEN RAISE EXCEPTION 'last_binding_change is server-controlled'; END IF;
  IF NEW.referral_code IS DISTINCT FROM OLD.referral_code THEN RAISE EXCEPTION 'referral_code is server-controlled'; END IF;
  IF NEW.referred_by IS DISTINCT FROM OLD.referred_by THEN RAISE EXCEPTION 'referred_by is server-controlled'; END IF;
  IF NEW.wallet_address IS DISTINCT FROM OLD.wallet_address THEN RAISE EXCEPTION 'wallet_address must be updated via the bind-wallet server function'; END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'created_at is immutable'; END IF;
  IF NEW.points_self IS DISTINCT FROM OLD.points_self THEN RAISE EXCEPTION 'points_self is server-controlled'; END IF;
  IF NEW.points_referral_activity IS DISTINCT FROM OLD.points_referral_activity THEN RAISE EXCEPTION 'points_referral_activity is server-controlled'; END IF;
  IF NEW.points_referral_signup IS DISTINCT FROM OLD.points_referral_signup THEN RAISE EXCEPTION 'points_referral_signup is server-controlled'; END IF;
  IF NEW.total_swap_volume_usd IS DISTINCT FROM OLD.total_swap_volume_usd THEN RAISE EXCEPTION 'total_swap_volume_usd is server-controlled'; END IF;

  RETURN NEW;
END;
$function$;

-- 3. Social-follow attestation table (self-attested; user marks each channel visited)
CREATE TABLE IF NOT EXISTS public.social_follows (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  youtube_confirmed_at timestamptz,
  x_confirmed_at timestamptz,
  telegram_confirmed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.social_follows TO authenticated;
GRANT ALL ON public.social_follows TO service_role;

ALTER TABLE public.social_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own social_follows"
  ON public.social_follows FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own social_follows"
  ON public.social_follows FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own social_follows"
  ON public.social_follows FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
