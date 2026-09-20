CREATE OR REPLACE FUNCTION public.prevent_protected_profile_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.bypass_profile_guard', true) = 'on'
     OR current_setting('request.jwt.claim.role', true) = 'service_role'
     OR current_user IN ('service_role', 'postgres')
     OR session_user IN ('service_role', 'postgres') THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.wallet_address IS DISTINCT FROM OLD.wallet_address
     OR NEW.referral_code IS DISTINCT FROM OLD.referral_code
     OR NEW.referred_by IS DISTINCT FROM OLD.referred_by
     OR NEW.flow_points IS DISTINCT FROM OLD.flow_points
     OR NEW.claimed_tokens IS DISTINCT FROM OLD.claimed_tokens
     OR NEW.points_self IS DISTINCT FROM OLD.points_self
     OR NEW.points_referral_activity IS DISTINCT FROM OLD.points_referral_activity
     OR NEW.points_referral_signup IS DISTINCT FROM OLD.points_referral_signup
     OR NEW.total_swap_volume_usd IS DISTINCT FROM OLD.total_swap_volume_usd
     OR NEW.binding_changes_count IS DISTINCT FROM OLD.binding_changes_count
     OR NEW.last_binding_change IS DISTINCT FROM OLD.last_binding_change
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'protected profile fields are server-controlled';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_protected_profile_updates() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS prevent_protected_profile_updates ON public.profiles;
CREATE TRIGGER prevent_protected_profile_updates
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_protected_profile_updates();

COMMENT ON TRIGGER prevent_protected_profile_updates ON public.profiles IS
  'Rejects direct client changes to points, rewards, volume, identity, and wallet-binding fields; trusted server operations bypass explicitly.';