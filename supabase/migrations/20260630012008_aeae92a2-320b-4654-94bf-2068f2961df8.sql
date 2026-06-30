
-- 1) Function search_path hardening on email-queue helpers.
ALTER FUNCTION public.enqueue_email(text, jsonb)        SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint)        SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;

-- 2) Profiles: add explicit owner-scoped INSERT and UPDATE policies.
--    The prevent_protected_profile_updates trigger still blocks sensitive
--    field changes from client; service_role bypasses RLS and policies.
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 3) siwe_nonces: explicit deny-all policy for anon/authenticated to document
--    that all access is service-role only (service_role bypasses RLS).
DROP POLICY IF EXISTS "Deny all client access to siwe_nonces" ON public.siwe_nonces;
CREATE POLICY "Deny all client access to siwe_nonces"
  ON public.siwe_nonces
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
