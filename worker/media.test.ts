import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import app from './index';
import { sniffMediaType } from './media';
import { Client, invite } from './test/helpers';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

async function editor(): Promise<{ c: Client; treeId: string }> {
  await invite('editor@example.org');
  const c = new Client();
  await c.signIn('editor@example.org');
  const acc = await c.call<{ id: string }>('POST', '/api/accounts', { name: 'F' });
  const tree = await c.call<{ id: string }>('POST', '/api/trees', {
    accountId: acc.body.id,
    name: 'T',
    gedcom: '0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 @I1@ INDI\n1 NAME A /B/\n0 TRLR',
  });
  return { c, treeId: tree.body.id };
}

async function put(c: Client, treeId: string, id: string, bytes: Uint8Array, type: string) {
  return app.request(
    `http://localhost/api/trees/${treeId}/media/${id}`,
    { method: 'PUT', headers: { 'Content-Type': type, Cookie: c.cookie, Origin: 'http://localhost' }, body: bytes },
    env,
  );
}

describe('media', () => {
  it('recognises allowed kinds from their bytes only', () => {
    expect(sniffMediaType(PNG)).toBe('image/png');
    expect(sniffMediaType(SVG)).toBeUndefined();
    expect(sniffMediaType(new TextEncoder().encode('%PDF-1.4 abcdefgh'))).toBe('application/pdf');
  });

  it('refuses an SVG even when declared as an image, and serves stored files as sandboxed downloads', async () => {
    const { c, treeId } = await editor();
    const svg = await put(c, treeId, 'Msvg', SVG, 'image/svg+xml');
    expect(svg.status).toBe(415);
    const lie = await put(c, treeId, 'Mlie', SVG, 'image/png');
    expect(lie.status).toBe(415);
    const ok = await put(c, treeId, 'Mpng', PNG, 'application/octet-stream');
    expect(ok.status).toBe(200);
    const got = await app.request(`http://localhost/api/trees/${treeId}/media/Mpng`, { headers: { Cookie: c.cookie } }, env);
    expect(got.status).toBe(200);
    expect(got.headers.get('content-type')).toBe('image/png');
    expect(got.headers.get('content-disposition')).toContain('attachment');
    expect(got.headers.get('x-content-type-options')).toBe('nosniff');
    expect(got.headers.get('content-security-policy')).toContain('sandbox');
    // Written once: the same id cannot be replaced.
    expect((await put(c, treeId, 'Mpng', PNG, 'image/png')).status).toBe(409);
  });

  it('refuses oversized uploads before reading them', async () => {
    const { c, treeId } = await editor();
    const res = await app.request(
      `http://localhost/api/trees/${treeId}/media/Mbig`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png', 'Content-Length': String(11 * 1024 * 1024), Cookie: c.cookie, Origin: 'http://localhost' },
        body: PNG,
      },
      env,
    );
    expect(res.status).toBe(413);
  });

  it('answers malformed JSON with 400, not a crash', async () => {
    const { c, treeId } = await editor();
    const res = await app.request(
      `http://localhost/api/trees/${treeId}/ops`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: c.cookie, Origin: 'http://localhost' }, body: '{not json' },
      env,
    );
    expect(res.status).toBe(400);
  });
});
