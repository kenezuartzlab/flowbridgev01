CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_org_member(_org uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  select exists (
    select 1 from public.partner_org_members m
    where m.org_id = _org and m.user_id = _user
  )
$$;

REVOKE ALL ON FUNCTION private.is_org_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_org_member(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Members read own organization" ON public.partner_organizations;
CREATE POLICY "Members read own organization" ON public.partner_organizations
  FOR SELECT TO authenticated USING (private.is_org_member(org_id, auth.uid()));

DROP POLICY IF EXISTS "Members read own membership rows" ON public.partner_org_members;
CREATE POLICY "Members read own membership rows" ON public.partner_org_members
  FOR SELECT TO authenticated USING (private.is_org_member(org_id, auth.uid()));

DROP POLICY IF EXISTS "Members read own org review history" ON public.campaign_review_events;
CREATE POLICY "Members read own org review history" ON public.campaign_review_events
  FOR SELECT TO authenticated USING (private.is_org_member(organization_id, auth.uid()));

DROP FUNCTION IF EXISTS public.is_org_member(uuid, uuid);