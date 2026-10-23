/** Owner-approved ad-hoc limit. No raw wallet/IP or request key is logged. */
export async function checkWalletRequestLimit(wallet: string): Promise<Response | null> {
  const secret = process.env['WALLET_REQUEST_LIMIT_SECRET'];
  if (!secret) return Response.json({ error: 'Wallet sign-in checks unavailable. Retry later.' }, { status: 503 });
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(wallet.toLowerCase()));
    const digest = Array.from(new Uint8Array(signature), x => x.toString(16).padStart(2, '0')).join('');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data, error } = await supabaseAdmin.rpc('consume_wallet_auth_request', { p_wallet_digest: digest });
    if (error || typeof data !== 'boolean') return Response.json({ error: 'Wallet sign-in checks unavailable. Retry later.' }, { status: 503 });
    return data ? null : Response.json({ error: 'Too many wallet sign-in requests. Retry in one minute.' }, { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Wallet sign-in checks unavailable. Retry later.' }, { status: 503 });
  }
}