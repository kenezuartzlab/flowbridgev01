alter table public.app_admins
  add column role text not null default 'super_admin'
  check (role in ('super_admin', 'internal_operator'));