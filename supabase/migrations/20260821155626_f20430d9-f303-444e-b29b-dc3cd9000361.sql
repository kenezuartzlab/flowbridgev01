REVOKE ALL ON FUNCTION public.prevent_submission_revision_mutation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_submission_revision_mutation() TO service_role;