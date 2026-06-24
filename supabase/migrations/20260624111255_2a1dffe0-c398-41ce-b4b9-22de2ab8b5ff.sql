
-- Tighten permissive policies on proposals
DROP POLICY IF EXISTS "Anyone authenticated can insert proposals" ON public.proposals;
DROP POLICY IF EXISTS "Anyone authenticated can upvote proposals" ON public.proposals;

CREATE POLICY "Authenticated users can insert proposals"
  ON public.proposals FOR INSERT
  TO authenticated
  WITH CHECK (length(text) > 0 AND length(category) > 0);

CREATE POLICY "Authenticated users can upvote proposals"
  ON public.proposals FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (votes >= 0);

-- Lock down SECURITY DEFINER trigger function from API
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
