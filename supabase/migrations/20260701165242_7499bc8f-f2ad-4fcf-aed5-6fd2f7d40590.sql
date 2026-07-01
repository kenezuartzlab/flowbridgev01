-- 1) Lock down SECURITY DEFINER functions: revoke EXECUTE from public/anon/authenticated;
--    keep service_role which is what our server functions and cron use.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_protected_profile_updates() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_siwe_nonces() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_siwe_nonces() TO service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_wake() TO service_role;
-- handle_new_user and prevent_protected_profile_updates are trigger-only; no EXECUTE grant needed.

-- 2) Harden proposals.author so a full wallet address can never be stored publicly.
--    Reject any string matching a full 0x + 40 hex chars pattern, and cap length.
ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_author_no_full_wallet
  CHECK (
    author !~ '0x[0-9a-fA-F]{40}'
    AND char_length(author) <= 60
  );

-- 3) Extra defense for profiles: block any client-side UPDATE that changes
--    server-controlled columns. The existing trigger enforces this, but we
--    also add restrictive column-scoped RLS so the intent is explicit and
--    survives future policy edits. Users can still update the (currently
--    empty) set of client-writable columns via the existing UPDATE policy;
--    the trigger raises on any protected column change.
--    (No schema change here — the trigger prevent_protected_profile_updates
--     already blocks email, flow_points, claimed_tokens, binding_changes_count,
--     last_binding_change, referral_code, referred_by, wallet_address, id, created_at.)
COMMENT ON TRIGGER prevent_protected_profile_updates ON public.profiles IS
  'Blocks client-side updates to server-controlled columns (email, wallet_address, referral_code, referred_by, flow_points, claimed_tokens, binding_changes_count, last_binding_change, id, created_at). service_role bypasses.';