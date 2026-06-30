
-- 1) Profiles: remove client UPDATE policy. All meaningful fields are blocked by
-- prevent_protected_profile_updates() anyway, and server functions use the
-- service role (which bypasses RLS). This eliminates RLS-level attack surface
-- for wallet_address / referred_by manipulation.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- 2) siwe_nonces: enforce automatic purge of used / expired nonces so wallet
-- addresses are not retained beyond their short verification window.
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.purge_siwe_nonces()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.siwe_nonces
  WHERE used_at IS NOT NULL
     OR expires_at < now();
$$;

-- (Re)schedule the purge job every 15 minutes.
DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'purge_siwe_nonces';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
  PERFORM cron.schedule(
    'purge_siwe_nonces',
    '*/15 * * * *',
    $cron$ SELECT public.purge_siwe_nonces(); $cron$
  );
END;
$$;
