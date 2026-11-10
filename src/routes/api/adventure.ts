import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('refresh') }).strict(),
  z.object({ action: z.literal('start'), topic: z.enum(['basics','ecosystem','safety']) }).strict(),
  z.object({ action: z.literal('answer'), topic: z.enum(['basics','ecosystem','safety']), challenge: z.string().uuid(), answers: z.array(z.number().int().min(0).max(2)).length(3) }).strict(),
]);
export async function handleAdventure(request: Request) {
  const { getAuthUser, jsonResponse } = await import('@/lib/api-auth.server');
  const reply = (data: unknown, status = 200) => { const r = jsonResponse(data, status); r.headers.set('Cache-Control','no-store'); return r; };
  const user = await getAuthUser(request);
  if (!user) return reply({ error: 'Sign in to view your Adventure.' },401);
  if (!user.emailVerified) return reply({ error: 'Verify your email before starting Adventure.' },403);
  // A server-owned flag AND an approved preview account are required. There is no production activation path.
  const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
  const { error: gate } = await db.rpc('adventure_assert_preview',{ p_user: user.id });
  if (gate) return reply({ error: 'Adventure is paused. Preview access is restricted to approved accounts.' },403);
  if (request.method === 'POST') {
    if (Number(request.headers.get('content-length') || 0) > 2048) return reply({error:'Request too large.'},413);
    const text = await request.text();
    if (text.length > 2048) return reply({error:'Request too large.'},413);
    let parsed;
    try { parsed = input.safeParse(JSON.parse(text)); } catch { return reply({error:'Invalid request.'},400); }
    if (!parsed.success) return reply({error:'Invalid quest request.'},400);
    const b = parsed.data;
    if (b.action !== 'refresh') {
      const { data, error } = await db.rpc('adventure_quiz',{ p_user:user.id,p_topic:b.topic,...(b.action === 'answer' ? {p_challenge:b.challenge,p_answers:b.answers} : {}) });
      if (error) return reply({error:'Quiz unavailable, expired or cooling down. Review the lesson before trying again.'},409);
      return reply(data);
    }
  }
  const { data, error } = await db.rpc('adventure_sync',{p_user:user.id});
  return error ? reply({error:'Verified progress is unavailable. Nothing was awarded.'},503) : reply(data);
}
export const Route = createFileRoute('/api/adventure')({ server: { handlers: { GET: ({request}) => handleAdventure(request), POST: ({request}) => handleAdventure(request) } } });