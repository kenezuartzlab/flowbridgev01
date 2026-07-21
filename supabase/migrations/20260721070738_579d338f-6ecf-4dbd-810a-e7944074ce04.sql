
-- Escape hatch for server-side bindings: trigger honors a per-transaction GUC.
-- Any code that must write to server-controlled columns from the admin client
-- sets `SET LOCAL app.bypass_profile_guard = 'on'` for that transaction.
CREATE OR REPLACE FUNCTION public.prevent_protected_profile_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.bypass_profile_guard', true) = 'on'
     OR current_setting('request.jwt.claim.role', true) = 'service_role'
     OR current_user = 'service_role'
     OR session_user = 'service_role'
     OR current_user = 'postgres'
     OR session_user = 'postgres' THEN
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

-- Server RPC that binds a wallet address atomically, bypassing the guard trigger.
-- Callable ONLY by service_role (admin server client); RLS + REVOKE keep it off
-- the reach of anon/authenticated.
CREATE OR REPLACE FUNCTION public.admin_bind_wallet(
  p_user_id uuid,
  p_wallet  text
) RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user public.profiles;
  v_dup  public.profiles;
  v_now  timestamptz := now();
  v_count int;
  v_last timestamptz;
  v_norm text := lower(trim(p_wallet));
BEGIN
  IF v_norm !~ '^0x[a-f0-9]{40}$' THEN
    RAISE EXCEPTION 'Invalid EVM wallet address';
  END IF;

  SELECT * INTO v_user FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  SELECT * INTO v_dup FROM public.profiles
    WHERE wallet_address = v_norm AND id <> p_user_id LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'This wallet address is already registered to another account.';
  END IF;

  v_count := COALESCE(v_user.binding_changes_count, 0);
  v_last  := v_user.last_binding_change;

  IF v_user.wallet_address IS NOT NULL AND lower(v_user.wallet_address) <> v_norm THEN
    IF v_last IS NOT NULL AND extract(epoch FROM (v_now - v_last)) / 86400 >= 30 THEN
      v_count := 0;
    END IF;
    IF v_count >= 2 THEN
      RAISE EXCEPTION 'Wallet binding change limit reached. Try again after 30 days.';
    END IF;
    v_count := v_count + 1;
    v_last := v_now;
  ELSIF v_user.wallet_address IS NULL THEN
    v_count := 1;
    v_last := v_now;
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'on', true);

  UPDATE public.profiles SET
    wallet_address = v_norm,
    binding_changes_count = v_count,
    last_binding_change = v_last
  WHERE id = p_user_id
  RETURNING * INTO v_user;

  RETURN v_user;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_bind_wallet(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_bind_wallet(uuid, text) TO service_role;
