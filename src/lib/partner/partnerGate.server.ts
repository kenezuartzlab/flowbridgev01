/**
 * FlowBridge V14 — SERVER-ONLY partner authorization.
 *
 * Every partner read/write resolves exactly one organization context here:
 *   1. valid Supabase bearer token,
 *   2. a membership row in public.partner_org_members for that org,
 *   3. the role recorded on that row (never a role sent by the browser).
 *
 * Organization ids supplied by the client are never trusted: they are only ever
 * used as a lookup key that must resolve to a membership row for the caller.
 */
import { getAuthUser, jsonResponse } from '@/lib/api-auth.server';
import { orgMayOperate, type PartnerMemberRole, type PartnerOrg } from './partnerTypes';

export interface PartnerContext {
  userId: string;
  email: string;
  orgId: string;
  role: PartnerMemberRole;
  org: PartnerOrg;
}

export type PartnerGateResult =
  | { ok: true; partner: PartnerContext }
  | { ok: false; response: Response };

export class PartnerError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'PartnerError';
    this.status = status;
  }
}

async function db() {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  return supabaseAdmin;
}

export interface MembershipRow {
  orgId: string;
  role: PartnerMemberRole;
  org: PartnerOrg;
}

function mapOrg(row: any, role?: PartnerMemberRole): PartnerOrg {
  return {
    orgId: row.org_id,
    slug: row.slug,
    name: row.name,
    website: row.website,
    description: row.description,
    status: row.status,
    isSystem: !!row.is_system,
    riskNotes: row.risk_notes ?? null,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : undefined,
    role,
  };
}

/** All organizations the user belongs to, with their recorded role. */
export async function listMemberships(userId: string): Promise<MembershipRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from('partner_org_members')
    .select('org_id,role,partner_organizations(*)')
    .eq('user_id', userId);
  if (error) throw new PartnerError(error.message, 500);
  return (data ?? [])
    .filter((r: any) => r.partner_organizations)
    .map((r: any) => ({
      orgId: r.org_id,
      role: r.role as PartnerMemberRole,
      org: mapOrg(r.partner_organizations, r.role as PartnerMemberRole),
    }));
}

/**
 * Resolves the active organization context. `x-org-id` selects between
 * memberships; it can never grant one.
 */
export async function requirePartner(
  request: Request,
  opts: { requireOperational?: boolean } = { requireOperational: true },
): Promise<PartnerGateResult> {
  const user = await getAuthUser(request);
  if (!user) return { ok: false, response: jsonResponse({ error: 'Unauthorized' }, 401) };
  if (!user.emailVerified) {
    return { ok: false, response: jsonResponse({ error: 'Verify your email to use Studio.' }, 403) };
  }

  let memberships: MembershipRow[];
  try {
    memberships = await listMemberships(user.id);
  } catch (e: any) {
    return { ok: false, response: jsonResponse({ error: e?.message ?? 'Lookup failed' }, 500) };
  }
  if (!memberships.length) {
    return {
      ok: false,
      response: jsonResponse({ error: 'No partner organization is linked to this account.' }, 403),
    };
  }

  const requested = (request.headers.get('x-org-id') ?? '').trim();
  const membership = requested
    ? memberships.find((m) => m.orgId === requested)
    : memberships[0];
  if (!membership) {
    // Existing-but-foreign org ids and guessed ids are indistinguishable here.
    return { ok: false, response: jsonResponse({ error: 'Organization not found.' }, 404) };
  }

  if (membership.org.isSystem) {
    return {
      ok: false,
      response: jsonResponse({ error: 'Internal campaigns are managed from the admin console.' }, 403),
    };
  }

  if (opts.requireOperational !== false && !orgMayOperate(membership.org.status)) {
    return {
      ok: false,
      response: jsonResponse(
        {
          error:
            membership.org.status === 'suspended'
              ? 'This organization is suspended. Contact FlowBridge.'
              : 'This organization is awaiting FlowBridge verification.',
        },
        403,
      ),
    };
  }

  return {
    ok: true,
    partner: {
      userId: user.id,
      email: user.email.toLowerCase(),
      orgId: membership.orgId,
      role: membership.role,
      org: membership.org,
    },
  };
}
