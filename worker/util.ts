/** Small helpers shared by the Worker routes. */

import { ERROR_MESSAGES, type ErrorCode } from './errorCodes';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Random id: a prefix and 11 base-36 characters, the same shape as the client's ids. */
export function randomId(prefix: string, length = 11): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = prefix;
  for (const b of bytes) out += ALPHABET[b % 36];
  return out;
}

/** A long random token for links and sessions (base64url, 32 bytes). */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** HMAC-SHA256 as hex; with no key it degrades to a plain hash (development). */
export async function hmac(key: string | undefined, text: string): Promise<string> {
  if (!key) return sha256(text);
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const buf = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** « j***@example.org »: enough to recognise a fellow member, not enough to write to them. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  return `${email.charAt(0)}***${email.slice(at)}`;
}

/**
 * The address a caller is allowed to see for someone else.
 *
 * Owners manage the roster and see real addresses; everyone else sees a masked
 * one, their own excepted. Every surface that returns an address goes through
 * here rather than repeating the condition — the rule was enforced on the
 * member roster and quietly broken on the snapshot list, which is exactly what
 * happens when the same decision is written twice.
 */
export function emailFor(email: string, seen: { isOwner: boolean; isSelf: boolean }): string {
  return seen.isOwner || seen.isSelf ? email : maskEmail(email);
}

export const now = (): number => Date.now();

/**
 * An expected error, answered as a status and a stable code.
 *
 * The message is derived from the code rather than passed in, so a route
 * cannot invent prose the browser has no way to translate. Anything genuinely
 * unexpected should be a plain `Error`: those become a 500 and are logged.
 */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    public extra?: Record<string, unknown>,
  ) {
    super(ERROR_MESSAGES[code]);
  }
}

/** Parse a JSON body, refusing oversized or malformed ones with a 4xx instead of a crash. */
export async function readJson<T extends object>(req: Request, maxBytes: number): Promise<Partial<T>> {
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new HttpError(413, 'body_too_large');
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'body_too_large');
  if (!text.trim()) return {};
  try {
    const v: unknown = JSON.parse(text);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'expected_json_object');
    return v as Partial<T>;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, 'malformed_json');
  }
}

/** Record and media ids: the client's shape or an imported xref, nothing that could break a GEDCOM line. */
export const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

/** `what` names the field for the operator's benefit; the code stays the same either way. */
export function requireId(value: unknown, what = 'id'): string {
  const s = String(value ?? '');
  if (!ID_RE.test(s)) throw new HttpError(400, 'bad_id', { field: what });
  return s;
}

export function normaliseEmail(raw: unknown): string {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || s.length > 254) throw new HttpError(400, 'invalid_email');
  return s;
}
