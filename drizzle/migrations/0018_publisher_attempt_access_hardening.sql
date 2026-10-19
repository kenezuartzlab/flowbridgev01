REVOKE ALL ON public.reward_publish_attempts FROM anon,authenticated;
GRANT ALL ON public.reward_publish_attempts TO service_role;