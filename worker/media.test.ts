import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { app } from './index';
import { MAX_ACCOUNT_BYTES, sniffMediaType } from './media';
import { Client, invite } from './test/helpers';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

async function editor(email = 'editor@example.org'): Promise<{ c: Client; treeId: string; accountId: string }> {
  await invite(email);
  const c = new Client();
  await c.signIn(email);
  const acc = await c.call<{ id: string }>('POST', '/api/accounts', { name: 'F' });
  const tree = await c.call<{ id: string }>('POST', '/api/trees', {
    accountId: acc.body.id,
    name: 'T',
    gedcom: '0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 @I1@ INDI\n1 NAME A /B/\n0 TRLR',
  });
  return { c, treeId: tree.body.id, accountId: acc.body.id };
}

async function put(c: Client, treeId: string, id: string, bytes: Uint8Array, type: string) {
  return app.request(
    `http://localhost/api/trees/${treeId}/media/${id}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': type, Cookie: c.cookie, Origin: 'http://localhost', 'cf-connecting-ip': c.ip },
      body: bytes,
    },
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

  it('refuses an upload once the account has no room left, and says how much room there was', async () => {
    // Uploading was the only unbounded write an ordinary user had. The rows are planted rather
    // than two gigabytes actually pushed through R2, which would take longer than the whole suite.
    const { c, treeId, accountId } = await editor('quota@example.org');
    await env.DB.prepare(
      `INSERT INTO media (id, tree_id, uploaded_by, content_type, size, created_at) VALUES (?, ?, 'u', 'image/png', ?, ?)`,
    )
      .bind('Mbulk', treeId, MAX_ACCOUNT_BYTES, Date.now())
      .run();
    const res = await put(c, treeId, 'Monemore', PNG, 'image/png');
    expect(res.status).toBe(413);
    const body = await res.json<{ code: string; limitBytes: number; usedBytes: number }>();
    expect(body.code).toBe('account_storage_full');
    expect(body.limitBytes).toBe(MAX_ACCOUNT_BYTES);
    expect(body.usedBytes).toBe(MAX_ACCOUNT_BYTES);
    // Nothing was written: not the object, not the row.
    expect(await env.MEDIA.head(`trees/${treeId}/media/Monemore`)).toBeNull();
    expect(await env.DB.prepare(`SELECT id FROM media WHERE id = 'Monemore'`).first()).toBeNull();

    // Marking it deleted does not free the space, because R2 keeps it for thirty days.
    await env.DB.prepare(`UPDATE media SET deleted_at = ? WHERE id = 'Mbulk'`).bind(Date.now()).run();
    expect((await put(c, treeId, 'Mstillno', PNG, 'image/png')).status).toBe(413);
    // And the storage screen reports the same total the quota counted, rather than a smaller one.
    const storage = await c.call<{ bytes: number; pendingBytes: number; limitBytes: number }>('GET', `/api/accounts/${accountId}/storage`);
    expect(storage.body.pendingBytes).toBe(MAX_ACCOUNT_BYTES);
    expect(storage.body.limitBytes).toBe(MAX_ACCOUNT_BYTES);

    // With the row gone, as the reaper would leave it, there is room again.
    await env.DB.prepare(`DELETE FROM media WHERE id = 'Mbulk'`).run();
    expect((await put(c, treeId, 'Mroomagain', PNG, 'image/png')).status).toBe(200);
  });
});
