-- FlowBridge V14 — Partner Campaign Studio: organizations, membership,
-- campaign review lifecycle and immutable audit events.

create type public.partner_member_role as enum ('partner_admin', 'partner_editor');
create type public.partner_org_status as enum ('pending', 'verified', 'rejected', 'suspended');
create type public.campaign_review_state as enum (
  'draft', 'submitted', 'changes_requested', 'approved', 'published', 'paused', 'ended'
);
create type public.campaign_reward_type as enum ('campaign_pts', 'flow_points_bonus', 'flow_token');

create table public.partner_organizations (
  org_id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  website text,
  description text,
  status public.partner_org_status not null default 'pending',
  is_system boolean not null default false,
  risk_notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.partner_organizations to authenticated;
grant all on public.partner_organizations to service_role;
alter table public.partner_organizations enable row level security;

create table public.partner_org_members (
  org_id uuid not null references public.partner_organizations(org_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.partner_member_role not null default 'partner_editor',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

grant select on public.partner_org_members to authenticated;
grant all on public.partner_org_members to service_role;
alter table public.partner_org_members enable row level security;

create or replace function public.is_org_member(_org uuid, _user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.partner_org_members m
    where m.org_id = _org and m.user_id = _user
  )
$$;

create policy "Members read own organization"
on public.partner_organizations for select to authenticated
using (public.is_org_member(org_id, auth.uid()));

create policy "Members read own membership rows"
on public.partner_org_members for select to authenticated
using (public.is_org_member(org_id, auth.uid()));

insert into public.partner_organizations (org_id, slug, name, description, status, is_system)
values (
  '00000000-0000-0000-0000-000000000001',
  'flowbridge',
  'FlowBridge',
  'FlowBridge internal campaign owner.',
  'verified',
  true
);

alter table public.campaigns
  add column organization_id uuid not null default '00000000-0000-0000-0000-000000000001'
    references public.partner_organizations(org_id) on delete restrict,
  add column review_state public.campaign_review_state not null default 'draft',
  add column reward_type public.campaign_reward_type not null default 'campaign_pts',
  add column created_by uuid references auth.users(id) on delete set null,
  add column submitted_at timestamptz,
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references auth.users(id) on delete set null,
  add column review_note text,
  add column revision integer not null default 1;

update public.campaigns
set review_state = case
  when status = 'published' then 'published'::public.campaign_review_state
  when status = 'archived' then 'ended'::public.campaign_review_state
  else 'draft'::public.campaign_review_state
end;

create index campaigns_organization_id_idx on public.campaigns (organization_id);
create index campaigns_review_state_idx on public.campaigns (review_state);

create table public.campaign_review_events (
  event_id uuid primary key default gen_random_uuid(),
  campaign_id text not null references public.campaigns(campaign_id) on delete cascade,
  organization_id uuid not null references public.partner_organizations(org_id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text not null,
  action text not null,
  from_state public.campaign_review_state,
  to_state public.campaign_review_state,
  note text,
  revision integer not null default 1,
  created_at timestamptz not null default now()
);

grant select on public.campaign_review_events to authenticated;
grant all on public.campaign_review_events to service_role;
alter table public.campaign_review_events enable row level security;

create policy "Members read own org review history"
on public.campaign_review_events for select to authenticated
using (public.is_org_member(organization_id, auth.uid()));

create index campaign_review_events_campaign_idx
  on public.campaign_review_events (campaign_id, created_at desc);

create table public.admin_audit_events (
  event_id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  actor_role text not null,
  object_type text not null,
  object_id text not null,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);

grant all on public.admin_audit_events to service_role;
alter table public.admin_audit_events enable row level security;

create index admin_audit_events_created_idx on public.admin_audit_events (created_at desc);