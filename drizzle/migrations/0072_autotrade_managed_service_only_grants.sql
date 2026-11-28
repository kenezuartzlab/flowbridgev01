REVOKE ALL ON public.autotrade_managed_intents, public.autotrade_managed_nonces, public.autotrade_managed_effects, public.autotrade_managed_pending FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.autotrade_managed_intents, public.autotrade_managed_nonces, public.autotrade_managed_effects TO service_role;
GRANT SELECT ON public.autotrade_managed_pending TO service_role;