import { describe, expect, it } from 'vitest';
import { adminClient, Client } from './test/helpers';

describe('browser error reports', () => {
  it('stores a capped report, refuses an empty one, and shows them to the administrator only', async () => {
    const c = new Client();
    // Longer than the stored caps (500 and 4000), within the 16 KB the endpoint reads.
    const long = 'x'.repeat(5000);
    const r = await c.call('POST', '/api/errors', {
      kind: 'render',
      message: `Boom ${'x'.repeat(600)}`,
      stack: long,
      url: 'http://localhost/#/',
      version: '0.1.0',
    });
    expect(r.status).toBe(201);
    expect((await c.call('POST', '/api/errors', { message: '   ' })).status).toBe(400);
    expect((await c.call('GET', '/api/admin/errors')).status).toBe(401);
    const admin = await adminClient();
    const list = await admin.call<{ errors: Array<{ message: string; stack: string | null; kind: string; email: string | null }> }>(
      'GET',
      '/api/admin/errors',
    );
    expect(list.status).toBe(200);
    const mine = list.body.errors.find((e) => e.message.startsWith('Boom'))!;
    expect(mine.message).toHaveLength(500);
    expect(mine.stack).toHaveLength(4000);
    expect(mine.kind).toBe('render');
    expect(mine.email).toBeNull();
    const cleared = await admin.call<{ deleted: number }>('DELETE', '/api/admin/errors');
    expect(cleared.body.deleted).toBeGreaterThanOrEqual(1);
  });

  it('limits one address to twenty reports per quarter hour', async () => {
    const c = new Client();
    let last = 0;
    for (let i = 0; i < 21; i++) last = (await c.call('POST', '/api/errors', { message: `e${i}` })).status;
    expect(last).toBe(429);
  });

  it('strips the fragment from the page, so a sign-in token cannot be stored in a report', async () => {
    // The browser already strips it. This route is unauthenticated by design, so a browser is not
    // the only thing that can post to it, and the guarantee must not depend on the caller.
    const c = new Client();
    expect(
      (
        await c.call('POST', '/api/errors', {
          message: 'Fragment test',
          url: 'https://ramure.example/#signin=SECRET-TOKEN-VALUE',
        })
      ).status,
    ).toBe(201);
    const admin = await adminClient();
    const list = await admin.call<{ errors: Array<{ message: string; url: string | null }> }>('GET', '/api/admin/errors');
    const mine = list.body.errors.find((e) => e.message === 'Fragment test')!;
    expect(mine.url).toBe('https://ramure.example/#…');
    expect(mine.url).not.toContain('SECRET-TOKEN-VALUE');
  });
});
