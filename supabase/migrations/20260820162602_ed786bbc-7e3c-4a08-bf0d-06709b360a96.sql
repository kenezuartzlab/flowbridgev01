DROP POLICY IF EXISTS "Anyone can read app settings" ON public.app_settings;
REVOKE ALL ON public.app_settings FROM anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;