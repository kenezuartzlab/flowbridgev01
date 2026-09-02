-- 1) A wallet may belong to exactly one account (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS profiles_wallet_address_unique_ci
  ON public.profiles (lower(wallet_address))
  WHERE wallet_address IS NOT NULL;

-- 2) Wallet binding is only ever established by the verified signature flow
--    (service_role). Account owners can no longer rebind their own wallet
--    address directly, which is what made wallet-keyed reward reads spoofable.
CREATE OR REPLACE FUNCTION public.enforce_verified_wallet_binding()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.wallet_address IS DISTINCT FROM OLD.wallet_address
     AND current_setting('role', true) IS DISTINCT FROM 'service_role'
     AND current_user <> 'service_role' THEN
    RAISE EXCEPTION 'wallet_address can only be changed by the verified wallet binding flow';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_enforce_verified_wallet_binding ON public.profiles;
CREATE TRIGGER profiles_enforce_verified_wallet_binding
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_verified_wallet_binding();

-- 3) Wallet-keyed reward reads now also require a bound wallet to exist.
DROP POLICY IF EXISTS "Users view own wallet completions" ON public.campaign_completions;
CREATE POLICY "Users view own wallet completions"
  ON public.campaign_completions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.wallet_address IS NOT NULL
      AND lower(p.wallet_address) = campaign_completions.user_wallet
  ));

DROP POLICY IF EXISTS "Users view own wallet completion evidence" ON public.campaign_completion_activities;
CREATE POLICY "Users view own wallet completion evidence"
  ON public.campaign_completion_activities FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.wallet_address IS NOT NULL
      AND lower(p.wallet_address) = campaign_completion_activities.user_wallet
  ));

DROP POLICY IF EXISTS "Users view own wallet campaign points" ON public.campaign_points_ledger;
CREATE POLICY "Users view own wallet campaign points"
  ON public.campaign_points_ledger FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.wallet_address IS NOT NULL
      AND lower(p.wallet_address) = campaign_points_ledger.user_wallet
  ));