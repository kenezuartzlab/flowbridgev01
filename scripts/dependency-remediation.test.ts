import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { csrf } from 'hono/csrf';

describe('Hono production dependency remediation', () => {
  it('rejects cross-origin hyperlink auditing posts instead of skipping CSRF validation', async () => {
    const app = new Hono();
    app.use('*', csrf());
    app.post('/write', (c) => c.text('accepted'));
    const response = await app.request('https://flowbridge.space/write', {
      method: 'POST',
      headers: { 'content-type': 'text/ping', origin: 'https://untrusted.invalid', 'sec-fetch-site': 'cross-site' },
      body: 'PING',
    });
    expect(response.status).toBe(403);
  });
  it('retains valid same-origin hyperlink auditing posts', async () => {
    const app = new Hono();
    app.use('*', csrf());
    app.post('/write', (c) => c.text('accepted'));
    const response = await app.request('https://flowbridge.space/write', {
      method: 'POST',
      headers: { 'content-type': 'text/ping', origin: 'https://flowbridge.space', 'sec-fetch-site': 'same-origin' },
      body: 'PING',
    });
    expect(response.status).toBe(200);
  });
});