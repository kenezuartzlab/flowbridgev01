
-- Restrict updates on profiles to authenticated owners and prevent client-side
-- tampering of server-controlled columns via a BEFORE UPDATE trigger.

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.prevent_protected_profile_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role bypasses this guard (used by backend server functions)
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'id is immutable';
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'email cannot be changed from client';
  END IF;
  IF NEW.flow_points IS DISTINCT FROM OLD.flow_points THEN
    RAISE EXCEPTION 'flow_points is server-controlled';
  END IF;
  IF NEW.claimed_tokens IS DISTINCT FROM OLD.claimed_tokens THEN
    RAISE EXCEPTION 'claimed_tokens is server-controlled';
  END IF;
  IF NEW.binding_changes_count IS DISTINCT FROM OLD.binding_changes_count THEN
    RAISE EXCEPTION 'binding_changes_count is server-controlled';
  END IF;
  IF NEW.last_binding_change IS DISTINCT FROM OLD.last_binding_change THEN
    RAISE EXCEPTION 'last_binding_change is server-controlled';
  END IF;
  IF NEW.referral_code IS DISTINCT FROM OLD.referral_code THEN
    RAISE EXCEPTION 'referral_code is server-controlled';
  END IF;
  IF NEW.referred_by IS DISTINCT FROM OLD.referred_by THEN
    RAISE EXCEPTION 'referred_by is server-controlled';
  END IF;
  IF NEW.wallet_address IS DISTINCT FROM OLD.wallet_address THEN
    RAISE EXCEPTION 'wallet_address must be updated via the bind-wallet server function';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'created_at is immutable';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_protected_profile_updates ON public.profiles;
CREATE TRIGGER prevent_protected_profile_updates
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_protected_profile_updates();
