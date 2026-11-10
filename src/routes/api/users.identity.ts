import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/api/users/identity')({ server: { handlers: { GET: async ({ request }) => {
  const { getAuthUser, jsonResponse, unauthorized } = await import('@/lib/api-auth.server');
  const user = await getAuthUser(request); if (!user) return unauthorized();
  const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
  const { data, error } = await db.from('identity_recovery_grants').select('target_wallet,expires_at,revoked_at,consumed_at').eq('user_id', user.id).maybeSingle();
  if (error) return jsonResponse({ error: 'Identity status unavailable' }, 503);
  return Response.json({ grant: data }, { headers: { 'Cache-Control': 'no-store' } });
} } } });