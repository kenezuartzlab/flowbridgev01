import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
export async function handleAdventureAdmin(request: Request) {
  const { requireAdmin } = await import('@/lib/admin/adminGate.server');
  const { jsonResponse } = await import('@/lib/api-auth.server');
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  if (gate.admin.role !== 'super_admin') return jsonResponse({error:'Super Admin required.'},403);
  const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
  if (request.method === 'POST') {
    const text = await request.text();
    if (text.length > 2048) return jsonResponse({error:'Request too large.'},413);
    let parsed;
    try { parsed = z.object({preview_enabled:z.boolean(),cooldown_seconds:z.number().int().min(30).max(3600),reason:z.string().trim().min(10).max(500)}).strict().safeParse(JSON.parse(text)); } catch { return jsonResponse({error:'Invalid request.'},400); }
    if (!parsed.success) return jsonResponse({error:'Valid cooldown and reason required.'},400);
    const { error } = await db.rpc('adventure_preview_setting',{p_actor:gate.admin.userId,p_wallet:gate.admin.wallet,p_enabled:parsed.data.preview_enabled,p_cooldown:parsed.data.cooldown_seconds,p_reason:parsed.data.reason});
    if (error) return jsonResponse({error:'Adventure settings were not saved.'},409);
  }
  const {data,error} = await db.from('adventure_config').select('preview_enabled,cooldown_seconds').eq('id',true).maybeSingle();
  const r = jsonResponse(error ? {error:'Settings unavailable.'} : data ?? {preview_enabled:false,cooldown_seconds:60},error ? 503 : 200);
  r.headers.set('Cache-Control','no-store'); return r;
}
export const Route = createFileRoute('/api/admin/adventure')({server:{handlers:{GET:({request})=>handleAdventureAdmin(request),POST:({request})=>handleAdventureAdmin(request)}}});