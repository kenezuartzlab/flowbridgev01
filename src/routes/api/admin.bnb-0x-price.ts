/**
 * V1.8 admin-only, read-only 0x indicative price probe (WBNB<->USDT, chain 56). Never /quote, never executable,
 * no caller URLs/tokens/chains/takers. HOLD: not used by any trading UI.
 */
import { createFileRoute } from '@tanstack/react-router';
import { requireAdmin } from '@/lib/admin/adminGate.server';
import { jsonResponse } from '@/lib/api-auth.server';
import { validateZeroExRequest } from '@/lib/bnb/zeroExPrice';

export const Route = createFileRoute('/api/admin/bnb-0x-price')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireAdmin(request);
        if (!gate.ok) return gate.response;
        let body: unknown = null;
        try { body = await request.json(); } catch { body = null; }
        const v = validateZeroExRequest(body);
        if (!v.ok) return jsonResponse({ provider: '0x', status: 'BLOCKED_REQUEST', executable: false, reason: v.reason }, 400);
        const { fetchZeroExPrice } = await import('@/lib/bnb/zeroExPrice.server');
        const r = await fetchZeroExPrice(v.req, { caller: gate.admin.userId });
        const res = jsonResponse(r, 200); res.headers.set('cache-control', 'no-store'); return res;
      },
    },
  },
});
