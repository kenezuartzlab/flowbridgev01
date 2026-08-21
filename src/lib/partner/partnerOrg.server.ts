/**
 * FlowBridge V14 — SERVER-ONLY partner organization onboarding.
 *
 * Applications create a PENDING organization plus a Partner Admin membership for
 * the applicant. Pending organizations cannot submit campaigns for review: only
 * FlowBridge verification flips them to `verified`.
 */
import { getAuthUser, jsonResponse } from '@/lib/api-auth.server';
import { listMemberships, PartnerError } from './partnerGate.server';
import { normalizeOrgSlug, validateOrgApplication, type PartnerOrg } from './partnerTypes';

async function db() {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  return supabaseAdmin;
}

export interface StudioSession {
  userId: string;
  email: string;
  orgs: PartnerOrg[];
}

export async function loadStudioSession(request: Request) {
  const user = await getAuthUser(request);
  if (!user) return { ok: false as const, response: jsonResponse({ error: 'Unauthorized' }, 401) };
  const memberships = await listMemberships(user.id);
  return {
    ok: true as const,
    session: {
      userId: user.id,
      email: user.email.toLowerCase(),
      orgs: memberships.filter((m) => !m.org.isSystem).map((m) => m.org),
    } satisfies StudioSession,
  };
}

export async function applyForOrganization(
  userId: string,
  raw: unknown,
): Promise<PartnerOrg> {
  const input = (raw ?? {}) as Record<string, unknown>;
  const name = String(input.name ?? '').trim();
  const slug = normalizeOrgSlug(String(input.slug ?? name));
  const website = input.website ? String(input.website).trim() : null;
  const description = input.description ? String(input.description).trim().slice(0, 600) : null;

  const errors = validateOrgApplication({ name, slug, website, description });
  if (errors.length) throw new PartnerError(errors.join(' '));

  const supabase = await db();
  const existingMemberships = await listMemberships(userId);
  if (existingMemberships.filter((m) => !m.org.isSystem).length >= 3) {
    throw new PartnerError('You already manage the maximum number of partner organizations.', 429);
  }

  const { data: taken } = await supabase
    .from('partner_organizations')
    .select('org_id')
    .eq('slug', slug)
    .maybeSingle();
  if (taken) throw new PartnerError(`Handle "${slug}" is already taken.`);

  const { data: org, error } = await supabase
    .from('partner_organizations')
    .insert({
      slug,
      name,
      website,
      description,
      status: 'pending',
      created_by: userId,
    })
    .select('*')
    .single();
  if (error) throw new PartnerError(error.message, 500);

  const { error: memberError } = await supabase.from('partner_org_members').insert({
    org_id: org.org_id,
    user_id: userId,
    role: 'partner_admin',
  });
  if (memberError) throw new PartnerError(memberError.message, 500);

  return {
    orgId: org.org_id,
    slug: org.slug,
    name: org.name,
    website: org.website,
    description: org.description,
    status: org.status,
    isSystem: false,
    role: 'partner_admin',
    createdAt: new Date(org.created_at).getTime(),
  };
}
