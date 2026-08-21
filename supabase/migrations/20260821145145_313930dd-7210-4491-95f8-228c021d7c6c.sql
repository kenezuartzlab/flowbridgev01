revoke execute on function public.is_org_member(uuid, uuid) from public;
revoke execute on function public.is_org_member(uuid, uuid) from anon;
grant execute on function public.is_org_member(uuid, uuid) to authenticated;
grant execute on function public.is_org_member(uuid, uuid) to service_role;