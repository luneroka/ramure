import { describe, expect, it } from 'vitest';
import { Client, invite } from './test/helpers';
import { ERROR_MESSAGES } from './errorCodes';
import { HttpError } from './util';

/** Codes are the contract; the browser matches on them, so the envelope must always carry one. */
describe('the error envelope', () => {
  it('carries a code beside the English message', async () => {
    const c = new Client();
    const r = await c.call<{ code: string; error: string }>('GET', '/api/trees?account=A0000000000');
    expect(r.status).toBe(401);
    expect(r.body.code).toBe('sign_in_required');
    expect(r.body.error).toBe('sign in required');
  });

  it('tells apart two refusals that share a status', async () => {
    // A 403 is not enough to say what happened: these are the same status, different reasons.
    const stranger = new Client();
    const a = await stranger.call<{ code: string }>('POST', '/api/auth/request', { email: 'nobody@example.org' });
    expect(a.status).toBe(403);
    expect(a.body.code).toBe('invitation_required');

    await invite('member@example.org');
    const member = new Client();
    await member.signIn('member@example.org');
    const b = await member.call<{ code: string }>('GET', '/api/admin/overview');
    expect(b.status).toBe(403);
    expect(b.body.code).toBe('administrator_only');
  });

  it('keeps the extra fields a caller needs to react', async () => {
    await invite('big@example.org');
    const c = new Client();
    await c.signIn('big@example.org');
    const acc = await c.call<{ id: string }>('POST', '/api/accounts', { name: 'Famille' });
    // Between the two limits on purpose: over MAX_DOC_BYTES (1.5 MB) so the document is refused,
    // but under readJson's MAX_DOC_BYTES + 4096 cap, which would otherwise answer body_too_large first.
    const r = await c.call<{ code: string; maxBytes: number }>('POST', '/api/trees', {
      accountId: acc.body.id,
      name: 'Trop grand',
      gedcom: 'x'.repeat(1_502_000),
    });
    expect(r.status).toBe(413);
    expect(r.body.code).toBe('tree_too_large');
    expect(r.body.maxBytes).toBe(1_500_000);
  });

  it('names the field on a malformed id without changing the code', () => {
    const err = new HttpError(400, 'bad_id', { field: 'media id' });
    expect(err.code).toBe('bad_id');
    expect(err.extra).toEqual({ field: 'media id' });
  });

  it('derives the message from the code, so a route cannot invent untranslatable prose', () => {
    expect(new HttpError(404, 'tree_not_found').message).toBe(ERROR_MESSAGES.tree_not_found);
  });
});
