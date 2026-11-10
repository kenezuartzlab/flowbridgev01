import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { recoveryRequest, validRecoveryExpiry } from '@/lib/wallet/identityPolicy';
async function gate(request: Request) {
  const { requireAdmin } = await import('@/lib/admin/adminGate.server');
  const result = await requireAdmin(request);
  if (!result.ok) return { response: result.response };
  if (result.admin.role !== 'super_admin') return { response: Response.json({ error: 'Super admin required' }, { status: 403 }) };
  return { actor: result.admin };
}
export const Route = createFileRoute('/api/admin/identity')({ server: { handlers: {
  GET: async ({ request }) => {
    const g = await gate(request); if (!g.actor) return g.response;
    const lookup = z.string().trim().max(254).refine(v => z.string().uuid().safeParse(v).success || z.string().email().safeParse(v).success).safeParse(new URL(request.url).searchParams.get('account'));
    if (!lookup.success) return Response.json({ error: 'Enter an exact account email or ID' }, { status: 400 });
    const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
    const byId = z.string().uuid().safeParse(lookup.data).success;
    const profile = await db.from('profiles').select('id,email,wallet_address,last_binding_change,binding_changes_count').eq(byId ? 'id' : 'email', byId ? lookup.data : lookup.data.toLowerCase()).maybeSingle();
    if (profile.error) return Response.json({ error: 'Identity lookup unavailable' }, { status: 503 });
    if (!profile.data) return Response.json({ error: 'Account not found' }, { status: 404 });
    const id = profile.data.id;
    const [pair, grant, review, audit] = await Promise.all([
      db.from('identity_pairs').select('*').eq('user_id', id).maybeSingle(),
      db.from('identity_recovery_grants').select('*').eq('user_id', id).maybeSingle(),
      db.from('identity_review_cases').select('category').eq('user_id', id).maybeSingle(),
      db.from('admin_audit_events').select('action,reason,created_at').eq('object_type','identity_recovery').eq('object_id', id).order('created_at', { ascending:false }).limit(30),
    ]);
    if ([pair,grant,review,audit].some(r => r.error)) return Response.json({ error: 'Identity evidence unavailable' }, { status: 503 });
    return Response.json({ policy: 'REBINDING_DISABLED', profile: profile.data, pair: pair.data, grant: grant.data, review: review.data, audit: audit.data }, { headers: { 'Cache-Control':'no-store' } });
  },
  POST: async ({ request }) => {
    const g = await gate(request); if (!g.actor) return g.response;
    const p = recoveryRequest.safeParse(await request.json().catch(() => null));
    if (!p.success || !validRecoveryExpiry(p.data.expiresAt)) return Response.json({ error: 'Verified ownership, reason, target wallet and expiry within 24 hours required' }, { status: 400 });
    const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
    const { error } = await db.rpc('set_identity_recovery', { p_actor:g.actor.userId,p_wallet:g.actor.wallet,p_user:p.data.userId,p_target:p.data.targetWallet,p_reason:p.data.reason,p_evidence:p.data.ownershipEvidence,p_expiry:p.data.expiresAt,p_revoke:false });
    return Response.json(error ? { error:'Recovery authorization refused; check ownership, uniqueness and prior use.' } : { success:true }, { status:error ? 409:200 });
  },
  DELETE: async ({ request }) => {
    const g = await gate(request); if (!g.actor) return g.response;
    const p = z.object({ userId:z.string().uuid(),reason:z.string().trim().min(10).max(500) }).safeParse(await request.json().catch(() => null));
    if (!p.success) return Response.json({ error:'Account and revocation reason required' }, { status:400 });
    const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
    const { error } = await db.rpc('set_identity_recovery',{p_actor:g.actor.userId,p_wallet:g.actor.wallet,p_user:p.data.userId,p_target:'',p_reason:p.data.reason,p_evidence:'',p_expiry:new Date().toISOString(),p_revoke:true});
    return Response.json(error ? {error:'Revocation failed'} : {success:true},{status:error ? 409:200});
  },
} } });