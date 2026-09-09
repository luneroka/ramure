/**
 * What every API response carries, and what the middleware refuses before a
 * route ever runs. The headers matter because the same origin also serves the
 * built app through `public/_headers`: two different answers from one host is
 * a trap for whoever reads it next, even when neither is unsafe.
 */

import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { app } from './index';

const get = (path: string, headers: Record<string, string> = {}) => app.request(`http://localhost${path}`, { headers }, env);

describe('API responses', () => {
  it('answer with the same frame and transport policy as the static assets do', async () => {
    const res = await get('/api/health');
    expect(res.status).toBe(200);
    // public/_headers says DENY and a year; Hono's defaults are SAMEORIGIN and 180 days.
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('cross-origin-resource-policy')).toBe('same-origin');
  });

  it('report the configuration verdict and nothing an anonymous caller should not have', async () => {
    const body = await (await get('/api/health')).json<{ ok: boolean; config: string }>();
    expect(body.ok).toBe(true);
    // The settings at fault are named on the administration page, never here.
    expect(Object.keys(body).sort()).toEqual(['config', 'ok', 'ts']);
  });

  it('refuse a write that came from another origin before it costs a query', async () => {
    const res = await app.request(
      'http://localhost/api/auth/request',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
        body: JSON.stringify({ email: 'someone@example.org' }),
      },
      env,
    );
    expect(res.status).toBe(403);
    expect((await res.json<{ code: string }>()).code).toBe('cross_site_request');
  });
});
