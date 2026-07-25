-- Tighten table privileges so client roles cannot attempt writes that no policy allows.

-- profiles: owner-scoped read/insert/update only; deletion is admin/server-only.
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.profiles FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- transactions_history: read-only for the owner; all writes go through server/service-role paths.
REVOKE ALL ON public.transactions_history FROM anon;
REVOKE ALL ON public.transactions_history FROM authenticated;
GRANT SELECT ON public.transactions_history TO authenticated;
GRANT ALL ON public.transactions_history TO service_role;