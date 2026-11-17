/** Server-only 0x /price transport. Key read from process.env inside the call; never logged or returned. */
import { buildZeroExPriceUrl, parseZeroExPrice, statusForHttp, ZEROX_TIMEOUT_MS, ZeroExGuard, type ZeroExPublicResult, type ZeroExRequest } from './zeroExPrice';

export const zeroExGuard = new ZeroExGuard();
type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export async function fetchZeroExPrice(req: ZeroExRequest, opts: { caller: string; apiKey?: string; fetchImpl?: Fetch; now?: () => number; latestBlock?: number; guard?: ZeroExGuard } ): Promise<ZeroExPublicResult> {
  const now = opts.now ?? Date.now; const guard = opts.guard ?? zeroExGuard;
  const key = opts.apiKey ?? process.env['ZEROX_API_KEY'];
  if (!key) return { provider: '0x', status: 'KEY_MISSING', executable: false, direction: req.direction, reason: 'BLOCKED_NO_CREDENTIALS' };
  const hit = guard.cached(req, now()); if (hit) return hit;
  if (!guard.allow(opts.caller, now())) return { provider: '0x', status: 'LOCAL_RATE_LIMITED', executable: false, direction: req.direction };
  guard.inFlight++;
  const started = now(); const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ZEROX_TIMEOUT_MS);
  try {
    const res = await (opts.fetchImpl ?? fetch)(buildZeroExPriceUrl(req), { method: 'GET', redirect: 'manual', signal: ctl.signal, headers: { '0x-api-key': key, '0x-version': 'v2', accept: 'application/json' } });
    const bad = statusForHttp(res.status);
    if (bad) { try { await res.body?.cancel(); } catch { /* ignore */ } return { provider: '0x', status: bad, executable: false, direction: req.direction, reason: `http-${res.status}` }; }
    if (!(res.headers.get('content-type') ?? '').includes('json')) return { provider: '0x', status: 'MALFORMED', executable: false, direction: req.direction, reason: 'content-type' };
    const text = await res.text(); if (text.length > 200_000) return { provider: '0x', status: 'MALFORMED', executable: false, direction: req.direction, reason: 'size' };
    let body: unknown; try { body = JSON.parse(text); } catch { return { provider: '0x', status: 'MALFORMED', executable: false, direction: req.direction, reason: 'json' }; }
    const out = parseZeroExPrice(req, body, { now: now(), observedAt: now(), latencyMs: now() - started, latestBlock: opts.latestBlock });
    guard.store(req, out, now()); return out;
  } catch (e) {
    const aborted = (e as { name?: string })?.name === 'AbortError';
    return { provider: '0x', status: aborted ? 'TIMEOUT' : 'NETWORK_ERROR', executable: false, direction: req.direction };
  } finally { clearTimeout(t); guard.inFlight--; }
}
