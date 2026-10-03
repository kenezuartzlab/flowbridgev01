-- SECURITY DEFINER made current_user the owner (postgres), so the guard bypassed
-- itself for every caller. Run as the caller so end users are always checked.
ALTER FUNCTION public.prevent_protected_profile_updates() SECURITY INVOKER;
ALTER FUNCTION public.prevent_protected_profile_inserts() SECURITY INVOKER;
REVOKE ALL ON public.reward_processing_events FROM anon, authenticated;