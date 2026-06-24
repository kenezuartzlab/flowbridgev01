
DROP POLICY IF EXISTS "Authenticated users can insert proposals" ON public.proposals;
DROP POLICY IF EXISTS "Authenticated users can upvote proposals" ON public.proposals;
REVOKE INSERT, UPDATE ON public.proposals FROM authenticated;
