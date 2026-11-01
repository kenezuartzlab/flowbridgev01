DROP POLICY IF EXISTS "public on-chain votes" ON public.vote_events;
REVOKE SELECT ON public.vote_events FROM anon, authenticated;